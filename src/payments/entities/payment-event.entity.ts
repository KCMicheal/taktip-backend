import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { Payment } from './payment.entity';
import { PaymentEventType } from '../enums/payment-event.enum';

/**
 * Append-only audit log for every event in the payment lifecycle.
 *
 * Each row records a single interaction with a payment provider —
 * initialization, verification, webhook receipt, success, failure, etc.
 * This table is INSERT-only (no updates, no deletes) to preserve the
 * audit trail for accounting, reporting, and failure analysis.
 */
@Entity('payment_events')
@Index('idx_payment_events_payment_id', ['paymentId'])
@Index('idx_payment_events_provider_event', ['provider', 'event'])
@Index('idx_payment_events_created_at', ['createdAt'])
export class PaymentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the parent Payment record */
  @Column({ type: 'uuid', name: 'payment_id' })
  paymentId: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  /** Denormalized provider name for easy querying */
  @Column({ type: 'varchar', name: 'provider' })
  provider: string;

  /** Event type — see PaymentEventType enum */
  @Column({ type: 'varchar', name: 'event' })
  event: string;

  /** Full request/response/context payload */
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** Outcome: 'success' | 'failed' | 'pending' */
  @Column({ type: 'varchar', default: 'success' })
  status: string;

  /** Error message or stack trace (for failures) */
  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;

  /** Client IP address (for webhook events) */
  @Column({ type: 'varchar', nullable: true, name: 'ip_address' })
  ipAddress: string | null;

  /** User agent (for webhook events) */
  @Column({ type: 'varchar', nullable: true, name: 'user_agent' })
  userAgent: string | null;

  /** Timestamp — this is the only date column (append-only) */
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
