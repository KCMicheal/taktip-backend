import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Provider-agnostic payment record.
 *
 * Tracks a single payment transaction initiated through any
 * supported payment provider (Paystack, Stripe, Flutterwave, etc.).
 * Each payment is linked to an optional Tip and logs provider-level
 * metadata for reconciliation and reporting.
 */
@Entity('payments')
export class Payment extends BaseEntity {
  /** FK to the Tip this payment is for (null for non-tip payments) */
  @Column({ type: 'uuid', nullable: true, name: 'tip_id' })
  tipId: string | null;

  /** Our unique transaction reference (e.g., TXT-1234-abcd) */
  @Column({ type: 'varchar', unique: true })
  reference: string;

  /** Payment provider name: 'paystack', 'stripe', etc. */
  @Column({ type: 'varchar', default: 'paystack' })
  provider: string;

  /** Provider's own reference/ID for this transaction (for reconciliation) */
  @Column({ type: 'varchar', nullable: true, name: 'provider_reference' })
  providerReference: string | null;

  /** Transaction amount in major currency units */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  /** ISO currency code */
  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  /** Payment status (1=PENDING, 2=SUCCESS, 3=FAILED, 4=REFUNDED, 5=CANCELLED) */
  @Column({ type: 'int', default: PaymentStatus.PENDING, name: 'payment_status' })
  paymentStatus: PaymentStatus;

  /** Human-readable failure reason (e.g., 'Insufficient funds', 'Card declined') */
  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason: string | null;

  /** Payment channel: 'card', 'bank_transfer', 'ussd', 'mobile_money', etc. */
  @Column({ type: 'varchar', nullable: true })
  channel: string | null;

  /** Arbitrary metadata attached at initialization */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Raw response from the payment provider (for debugging) */
  @Column({ type: 'jsonb', nullable: true, name: 'provider_response' })
  providerResponse: Record<string, unknown> | null;

  /** Timestamp of successful payment */
  @Column({ type: 'timestamp', nullable: true, name: 'paid_at' })
  paidAt: Date | null;

  /** Timestamp of refund (if applicable) */
  @Column({ type: 'timestamp', nullable: true, name: 'refunded_at' })
  refundedAt: Date | null;
}
