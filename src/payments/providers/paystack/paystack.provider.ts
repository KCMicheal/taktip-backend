import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import Paystack, { PaystackInstance } from 'paystack-api';
import {
  PaymentProvider,
  InitializeTransactionParams,
  InitializeTransactionResult,
  VerifyTransactionResult,
} from '../interfaces/payment-provider.interface';
import { Payment } from '../../entities/payment.entity';
import { PaymentStatus } from '../../enums/payment-status.enum';
import { PaymentEventService } from '../../payment-event.service';
import { PaymentEventType } from '../../enums/payment-event.enum';
import { Tip } from '../../../tips/entities/tip.entity';
import { TipStatus } from '../../../tips/enums/tip-status.enum';
import { TipSource } from '../../../tips/enums/tip-source.enum';
import { Wallet } from '../../../wallet/entities/wallet.entity';
import { Transaction } from '../../../wallet/entities/transaction.entity';
import { TransactionType } from '../../../wallet/enums/transaction-type.enum';
import { TransactionStatus } from '../../../wallet/enums/transaction-status.enum';
import { CustomerProfile } from '../../../customer/entities/customer-profile.entity';
import { User } from '../../../auth/entities/user.entity';
import { MailService } from '../../../auth/services/mail.service';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';

  private readonly logger = new Logger(PaystackProvider.name);
  private readonly paystack: PaystackInstance;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly paymentEventService: PaymentEventService,
    private readonly mailService: MailService,
  ) {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
    this.paystack = new Paystack(secretKey);
  }

  // ───────── Reference generation ─────────

  /**
   * Generate a unique transaction reference with the TXT- prefix.
   */
  private generateReference(): string {
    return `TXT-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  // ───────── Initialize ─────────

  async initializeTransaction(
    params: InitializeTransactionParams,
  ): Promise<InitializeTransactionResult> {
    const reference = params.reference || this.generateReference();
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.com');
    const callbackUrl =
      params.callbackUrl ?? `${appUrl}/tip/callback`;
    const amountInKobo = Math.round(params.amount * 100);

    // Log the intent (before the API call)
    // We don't have a paymentId yet, so we skip the event log here.
    // The calling controller will have the payment ID after persisting.

    try {
      const response = await this.paystack.transaction.initialize({
        email: params.email,
        amount: amountInKobo,
        reference,
        metadata: params.metadata || {},
        callback_url: callbackUrl,
      });

      this.logger.log(`Paystack transaction initialized: ${reference}`);

      // Persist PENDING payment record
      const payment = this.paymentRepository.create({
        reference,
        provider: this.name,
        amount: params.amount,
        currency: params.currency || 'NGN',
        paymentStatus: PaymentStatus.PENDING,
        metadata: params.metadata || null,
      } as Partial<Payment>);

      const savedPayment = await this.paymentRepository.save(payment);

      // Log success event
      await this.paymentEventService.log({
        paymentId: savedPayment.id,
        provider: this.name,
        event: PaymentEventType.INITIALIZE_SUCCESS,
        status: 'success',
        payload: {
          reference,
          amount: params.amount,
          email: params.email,
          authorization_url: response.data.authorization_url,
        },
      });

      this.logger.log(`Payment record created: ${savedPayment.id} (ref: ${reference})`);

      return {
        authorizationUrl: response.data.authorization_url,
        reference,
        accessCode: response.data.access_code,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Paystack initialize failed for ref ${reference}: ${errorMessage}`,
      );

      // Try to persist a failed Payment record for audit purposes
      try {
        const payment = this.paymentRepository.create({
          reference,
          provider: this.name,
          amount: params.amount,
          currency: params.currency || 'NGN',
          paymentStatus: PaymentStatus.FAILED,
          failureReason: errorMessage,
          metadata: params.metadata || null,
        } as Partial<Payment>);

        const savedPayment = await this.paymentRepository.save(payment);

        await this.paymentEventService.log({
          paymentId: savedPayment.id,
          provider: this.name,
          event: PaymentEventType.INITIALIZE_FAILED,
          status: 'failed',
          errorMessage,
          payload: { reference, amount: params.amount, email: params.email },
        });
      } catch {
        // If even the fallback fails, just log and re-throw
        this.logger.error(
          `Failed to persist failed Payment record for ref ${reference}`,
        );
      }

      throw error;
    }
  }

  // ───────── Verify ─────────

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const payment = await this.paymentRepository.findOne({ where: { reference } });
    const paymentId = payment?.id ?? 'unknown';

    // Log verification attempt
    const eventLog = this.paymentEventService.log({
      paymentId,
      provider: this.name,
      event: PaymentEventType.VERIFY_REQUESTED,
      status: 'pending',
      payload: { reference },
    });

    try {
      const response = await this.paystack.transaction.verify({ reference });

      // Flush the pending log
      await eventLog;

      const data = response.data as Record<string, unknown>;
      const isSuccess = data.status === 'success';

      await this.paymentEventService.log({
        paymentId,
        provider: this.name,
        event: PaymentEventType.VERIFY_SUCCESS,
        status: isSuccess ? 'success' : 'failed',
        payload: { reference, status: data.status, amount: data.amount },
      });

      return {
        status: isSuccess,
        amount: Number(data.amount) / 100,
        currency: (data.currency as string) || 'NGN',
        gatewayResponse: (data.gateway_response as string) || null,
        paidAt: (data.paid_at as string) || null,
        channel: (data.channel as string) || 'unknown',
        metadata: (data.metadata as Record<string, unknown>) || null,
        providerReference: reference,
        raw: data,
      };
    } catch (error) {
      // Flush the pending log
      await eventLog;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.paymentEventService.log({
        paymentId,
        provider: this.name,
        event: PaymentEventType.VERIFY_FAILED,
        status: 'failed',
        errorMessage,
        payload: { reference },
      });

      throw error;
    }
  }

  // ───────── Webhook handling ─────────

  async handleWebhook(
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (event === 'charge.success') {
      await this.handleChargeSuccess(data);
    } else if (event === 'charge.failed') {
      await this.handleChargeFailed(data);
    } else {
      this.logger.log(`Unhandled Paystack webhook event: ${event}`);
    }
  }

  private async handleChargeSuccess(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = data.reference as string | undefined;
    if (!reference) {
      this.logger.warn('charge.success webhook missing reference');
      return;
    }

    const payment = await this.paymentRepository.findOne({ where: { reference } });
    if (!payment) {
      this.logger.warn(`Payment not found for reference: ${reference}`);
      return;
    }

    // Idempotency guard — skip if already processed (Paystack may retry webhooks)
    if (payment.paymentStatus === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Payment ${payment.id} (ref: ${reference}) already SUCCESS — skipping duplicate`,
      );
      return;
    }

    // Update payment to SUCCESS with enriched provider data
    payment.paymentStatus = PaymentStatus.SUCCESS;
    payment.providerResponse = data;
    payment.channel = (data.channel as string) || null;
    payment.paidAt = data.paid_at ? new Date(data.paid_at as string) : new Date();
    payment.providerReference = reference;
    await this.paymentRepository.save(payment);

    this.logger.log(`Payment ${payment.id} (ref: ${reference}) marked as SUCCESS`);

    // Log the success event
    await this.paymentEventService.log({
      paymentId: payment.id,
      provider: this.name,
      event: PaymentEventType.PAYMENT_SUCCEEDED,
      status: 'success',
      payload: {
        reference,
        amount: payment.amount,
        channel: payment.channel,
        paidAt: payment.paidAt,
      },
    });

    // Update the associated Tip if one exists
    if (payment.tipId) {
      const tip = await this.tipRepository.findOne({ where: { id: payment.tipId } });
      if (tip) {
        tip.tipStatus = TipStatus.COMPLETED;
        await this.tipRepository.save(tip);
        this.logger.log(`Tip ${tip.id} marked as COMPLETED`);

        const amount = Number(tip.amount);

        // ── C2C card tip: credit recipient customer wallet ──
        if (tip.source === TipSource.CUSTOMER_TO_CUSTOMER) {
          // staffProfileId is repurposed as the recipient customer profile ID
          await this.walletRepository.manager.query(
            'UPDATE "wallets" SET "balance_pending" = CAST("balance_pending" AS numeric(15,2)) + $1 WHERE "owner_id" = $2 AND "owner_type" = $3',
            [amount, tip.staffProfileId, 'customer'],
          );

          this.logger.log(
            `Credited ${amount} to balance_pending of recipient customer wallet ` +
              `(customerProfileId: ${tip.staffProfileId})`,
          );

          // Send email notification to recipient (fire-and-forget)
          this.notifyC2cTipRecipient(tip, amount).catch(
            (err: Error) => this.logger.error(`Failed to send C2C tip email: ${err.message}`, err.stack),
          );
        } else {
          // ── Staff tip: credit staff wallet ──
          await this.walletRepository.manager.query(
            'UPDATE "wallets" SET "balance_pending" = CAST("balance_pending" AS numeric(15,2)) + $1 WHERE "owner_id" = $2 AND "owner_type" = $3',
            [amount, tip.staffProfileId, 'staff'],
          );

          this.logger.log(
            `Credited ${amount} to balance_pending of staff wallet ` +
              `(staffProfileId: ${tip.staffProfileId})`,
          );
        }
      } else {
        this.logger.warn(`Tip not found for id: ${payment.tipId}`);
      }
    }

    // ── Wallet deposit: credit balance_available directly ──
    const metadata = payment.metadata;
    if (metadata?.deposit === true && metadata?.walletId) {
      const walletId = metadata.walletId as string;
      const amount = payment.amount;

      // Credit balance_available (no pending — it's the customer's own money)
      await this.walletRepository.manager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [amount, walletId],
      );

      this.logger.log(`Deposit: credited ${amount} to balance_available of wallet ${walletId}`);

      // Fetch wallet to capture balance_before / balance_after
      const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
      const balanceAfter = wallet?.balanceAvailable ?? amount;
      const balanceBefore = balanceAfter - amount;

      // Create a DEPOSIT transaction record
      const tx = this.transactionRepository.create({
        walletId,
        type: TransactionType.DEPOSIT,
        amount,
        fee: 0,
        reference: payment.reference,
        description: 'Wallet deposit via Paystack',
        transactionStatus: TransactionStatus.COMPLETED,
        balanceBefore,
        balanceAfter,
      });
      await this.transactionRepository.save(tx);

      this.logger.log(`Deposit transaction ${tx.id} created for wallet ${walletId} (ref: ${payment.reference})`);
    }
  }

  private async handleChargeFailed(
    data: Record<string, unknown>,
  ): Promise<void> {
    const reference = data.reference as string | undefined;
    if (!reference) {
      this.logger.warn('charge.failed webhook missing reference');
      return;
    }

    const payment = await this.paymentRepository.findOne({ where: { reference } });
    if (!payment) {
      this.logger.warn(`Payment not found for reference: ${reference}`);
      return;
    }

    // Idempotency guard — skip if already in a terminal state (success or failed)
    if (payment.paymentStatus === PaymentStatus.SUCCESS || payment.paymentStatus === PaymentStatus.FAILED) {
      this.logger.log(
        `Payment ${payment.id} (ref: ${reference}) already in terminal state — skipping duplicate`,
      );
      return;
    }

    // Update payment to FAILED
    payment.paymentStatus = PaymentStatus.FAILED;
    payment.providerResponse = data;
    payment.failureReason = (data.gateway_response as string) || 'Payment failed';
    await this.paymentRepository.save(payment);

    this.logger.log(`Payment ${payment.id} (ref: ${reference}) marked as FAILED`);

    // Log the failure event
    await this.paymentEventService.log({
      paymentId: payment.id,
      provider: this.name,
      event: PaymentEventType.PAYMENT_FAILED,
      status: 'failed',
      errorMessage: payment.failureReason,
      payload: { reference, gateway_response: data.gateway_response },
    });

    // Update the associated Tip if one exists
    if (payment.tipId) {
      const tip = await this.tipRepository.findOne({ where: { id: payment.tipId } });
      if (tip) {
        tip.tipStatus = TipStatus.FAILED;
        await this.tipRepository.save(tip);
        this.logger.log(`Tip ${tip.id} marked as FAILED`);
      } else {
        this.logger.warn(`Tip not found for id: ${payment.tipId}`);
      }
    }

    // ── Failed wallet deposit: log a FAILED transaction in the wallet ledger ──
    const metadata = payment.metadata;
    if (metadata?.deposit === true && metadata?.walletId) {
      const walletId = metadata.walletId as string;
      const amount = payment.amount;
      const failureReason = payment.failureReason || 'Payment failed';

      // Fetch wallet to capture a balance snapshot (balance unchanged for failed deposits)
      const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
      const currentBalance = wallet?.balanceAvailable ?? 0;

      // Create a FAILED DEPOSIT transaction record for audit trail
      const tx = this.transactionRepository.create({
        walletId,
        type: TransactionType.DEPOSIT,
        amount,
        fee: 0,
        reference: payment.reference,
        description: `Failed wallet deposit via Paystack: ${failureReason}`,
        transactionStatus: TransactionStatus.FAILED,
        balanceBefore: currentBalance,
        balanceAfter: currentBalance,
      });
      await this.transactionRepository.save(tx);

      this.logger.log(
        `Failed deposit transaction ${tx.id} logged for wallet ${walletId} (ref: ${payment.reference})`,
      );
    }
  }

  // ───────── C2C tip recipient notification ─────────

  /**
   * Send an email notification to the C2C tip recipient.
   * Fire-and-forget — caller handles error logging.
   */
  private async notifyC2cTipRecipient(
    tip: Tip,
    amount: number,
  ): Promise<void> {
    // Resolve recipient profile and sender profile in parallel
    const [recipientProfile, senderProfile] = await Promise.all([
      this.customerProfileRepository.findOne({ where: { id: tip.staffProfileId } }),
      tip.customerProfileId
        ? this.customerProfileRepository.findOne({ where: { id: tip.customerProfileId } })
        : Promise.resolve(null),
    ]);

    if (!recipientProfile?.userId) {
      this.logger.warn(`Cannot notify C2C recipient ${tip.staffProfileId}: profile not found`);
      return;
    }

    // Resolve recipient user email
    const recipientUser = await this.userRepository.findOne({
      where: { id: recipientProfile.userId },
    });
    if (!recipientUser?.email) {
      this.logger.warn(`Cannot notify recipient ${tip.staffProfileId}: no email found`);
      return;
    }

    const senderName = senderProfile?.displayName || 'A customer';

    await this.mailService.sendTipReceivedEmail(
      recipientUser.email,
      senderName,
      amount,
    );
  }

  // ───────── Transfer / Payout methods ─────────

  /**
   * Create a transfer recipient (Paystack: Transfer Recipient).
   *
   * This is called once per customer bank account. The returned
   * `recipientCode` should be saved alongside the customer's payment
   * method for reuse on subsequent withdrawals.
   */
  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency?: string;
  }): Promise<{ recipientCode: string; active: boolean }> {
    try {
      const response = await this.paystack.transfer_recipient.create({
        type: 'nuban',
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: params.currency || 'NGN',
      });

      this.logger.log(
        `Transfer recipient created: ${response.data.recipient_code} for ${params.accountNumber}`,
      );

      return {
        recipientCode: response.data.recipient_code,
        active: response.data.active,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create transfer recipient: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Initiate a payout (Paystack: Transfer).
   *
   * Amount must be in **kobo** (the smallest currency unit).
   * The calling service is responsible for converting from major units.
   */
  async initiateTransfer(params: {
    amount: number;
    recipientCode: string;
    reference?: string;
    reason?: string;
  }): Promise<{
    transferCode: string;
    reference: string;
    status: string;
  }> {
    const reference = params.reference || this.generateReference();
    const reason = params.reason || 'Wallet withdrawal';

    try {
      const response = await this.paystack.transfer.create({
        source: 'balance',
        amount: params.amount, // kobo
        recipient: params.recipientCode,
        reference,
        reason,
      });

      this.logger.log(
        `Transfer initiated: ${response.data.transfer_code} (ref: ${response.data.reference}) — ${response.data.amount} kobo`,
      );

      return {
        transferCode: response.data.transfer_code,
        reference: response.data.reference,
        status: response.data.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initiate transfer: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Verify a transfer (Paystack: Transfer verification).
   */
  async verifyTransfer(reference: string): Promise<{
    transferCode: string;
    reference: string;
    amount: number;
    status: string;
    failureReason?: string;
  }> {
    try {
      const response = await this.paystack.transfer.verify({ reference });

      this.logger.log(
        `Transfer verified: ${response.data.transfer_code} (ref: ${response.data.reference}) — status: ${response.data.status}`,
      );

      return {
        transferCode: response.data.transfer_code,
        reference: response.data.reference,
        amount: response.data.amount,
        status: response.data.status,
        failureReason: response.data.failure_reason,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to verify transfer: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Check the Paystack balance on the integration.
   */
  async checkProviderBalance(): Promise<Array<{ currency: string; balance: number }>> {
    try {
      const response = await this.paystack.transfer_control.balance();
      return response.data.map((b: { currency: string; balance: number }) => ({
        currency: b.currency,
        balance: b.balance,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to check provider balance: ${errorMessage}`);
      throw error;
    }
  }

  // ───────── Signature verification ─────────

  /**
   * Verify an HMAC-SHA512 signature per Paystack's specification.
   *
   * @see https://paystack.com/docs/payments/webhooks/#verify-event-origin-with-signature-validation
   */
  verifyWebhookSignature(signature: string, rawBody: string): boolean {
    // Paystack signs webhooks with your API Secret Key, NOT a separate webhook secret
    // See: https://paystack.com/docs/payments/webhooks/#verify-event-origin-with-signature-validation
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
    if (!secret) {
      this.logger.error('PAYSTACK_SECRET_KEY is not configured for webhook verification');
      return false;
    }

    const hash = createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    return hash === signature;
  }
}
