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
import { Wallet } from '../../../wallet/entities/wallet.entity';

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
    private readonly configService: ConfigService,
    private readonly paymentEventService: PaymentEventService,
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
        callback_url: `${appUrl}/tip/callback`,
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

        // Credit the staff wallet's balance_pending atomically
        const amount = Number(tip.amount);
        await this.walletRepository.manager.query(
          'UPDATE "wallets" SET "balance_pending" = CAST("balance_pending" AS numeric(15,2)) + $1 WHERE "owner_id" = $2 AND "owner_type" = $3',
          [amount, tip.staffProfileId, 'staff'],
        );

        this.logger.log(
          `Credited ${amount} to balance_pending of staff wallet ` +
            `(staffProfileId: ${tip.staffProfileId})`,
        );
      } else {
        this.logger.warn(`Tip not found for id: ${payment.tipId}`);
      }
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
  }

  // ───────── Signature verification ─────────

  /**
   * Verify an HMAC-SHA512 signature per Paystack's specification.
   *
   * @see https://paystack.com/docs/payments/webhooks/#verify-event-origin-with-signature-validation
   */
  verifyWebhookSignature(signature: string, rawBody: string): boolean {
    const secret = this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET', '');
    if (!secret) {
      this.logger.error('PAYSTACK_WEBHOOK_SECRET is not configured');
      return false;
    }

    const hash = createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    return hash === signature;
  }
}
