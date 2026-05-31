import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import Paystack, { PaystackInstance } from 'paystack-api';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { Tip } from '../tips/entities/tip.entity';
import { TipStatus } from '../tips/enums/tip-status.enum';
import { Wallet } from '../wallet/entities/wallet.entity';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly paystack: PaystackInstance;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
    this.paystack = new Paystack(secretKey);
  }

  /**
   * Generate a unique reference for a payment transaction.
   */
  private generateReference(): string {
    return `TXT-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Initialize a Paystack transaction and persist a PENDING Payment record.
   *
   * @returns The Paystack authorization URL, reference, and access code.
   */
  async initializeTransaction(data: {
    email: string;
    amount: number;
    reference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; reference: string; accessCode: string }> {
    const reference = data.reference || this.generateReference();
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.com');
    const amountInKobo = Math.round(data.amount * 100);

    const response = await this.paystack.transaction.initialize({
      email: data.email,
      amount: amountInKobo,
      reference,
      metadata: data.metadata || {},
      callback_url: `${appUrl}/tip/callback`,
    });

    this.logger.log(`Paystack transaction initialized: ${reference}`);

    // Persist PENDING payment record
    const payment = this.paymentRepository.create({
      reference,
      amount: data.amount,
      currency: 'NGN',
      paymentStatus: PaymentStatus.PENDING,
      metadata: data.metadata || null,
    } as Partial<Payment>);

    await this.paymentRepository.save(payment);
    this.logger.log(`Payment record created: ${payment.id} (ref: ${reference})`);

    return {
      authorizationUrl: response.data.authorization_url,
      reference,
      accessCode: response.data.access_code,
    };
  }

  /**
   * Verify a transaction reference with Paystack.
   *
   * @returns Verified transaction details from Paystack.
   */
  async verifyTransaction(reference: string): Promise<{ status: boolean; amount: number; metadata: any }> {
    const response = await this.paystack.transaction.verify({ reference });

    return {
      status: response.data.status === 'success',
      amount: response.data.amount / 100,
      metadata: response.data.metadata,
    };
  }

  /**
   * Process a Paystack webhook event.
   *
   * For 'charge.success': updates the Payment record to SUCCESS, updates the
   * associated Tip to COMPLETED, and atomically credits the staff wallet's
   * balance_pending.
   *
   * For 'charge.failed': updates the Payment record to FAILED.
   */
  async handleWebhook(event: string, data: Record<string, unknown>): Promise<void> {
    if (event === 'charge.success') {
      await this.handleChargeSuccess(data);
    } else if (event === 'charge.failed') {
      await this.handleChargeFailed(data);
    } else {
      this.logger.log(`Unhandled webhook event: ${event}`);
    }
  }

  /**
   * Handle a successful charge webhook.
   */
  private async handleChargeSuccess(data: Record<string, unknown>): Promise<void> {
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

    // Update payment to SUCCESS
    payment.paymentStatus = PaymentStatus.SUCCESS;
    payment.paystackResponse = data;
    payment.paidAt = new Date();
    await this.paymentRepository.save(payment);

    this.logger.log(`Payment ${payment.id} (ref: ${reference}) marked as SUCCESS`);

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

        this.logger.log(`Credited ${amount} to balance_pending of staff wallet (staffProfileId: ${tip.staffProfileId})`);
      } else {
        this.logger.warn(`Tip not found for id: ${payment.tipId}`);
      }
    }
  }

  /**
   * Handle a failed charge webhook.
   */
  private async handleChargeFailed(data: Record<string, unknown>): Promise<void> {
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

    payment.paymentStatus = PaymentStatus.FAILED;
    payment.paystackResponse = data;
    await this.paymentRepository.save(payment);

    this.logger.log(`Payment ${payment.id} (ref: ${reference}) marked as FAILED`);
  }

  /**
   * Verify the HMAC-SHA256 signature of a webhook payload.
   *
   * @param signature - The value of the `x-paystack-signature` header.
   * @param body - The raw request body as a string.
   * @returns true if the signature is valid, false otherwise.
   */
  verifyWebhookSignature(signature: string, body: string): boolean {
    const secret = this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET', '');
    if (!secret) {
      this.logger.error('PAYSTACK_WEBHOOK_SECRET is not configured');
      return false;
    }

    const hash = createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return hash === signature;
  }
}
