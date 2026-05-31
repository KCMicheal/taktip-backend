import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

@Entity('payments')
export class Payment extends BaseEntity {
  @Column({ type: 'uuid', nullable: true, name: 'tip_id' })
  tipId: string | null;

  @Column({ type: 'varchar', unique: true })
  reference: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ type: 'int', default: PaymentStatus.PENDING, name: 'payment_status' })
  paymentStatus: PaymentStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, name: 'paystack_response' })
  paystackResponse: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true, name: 'paid_at' })
  paidAt: Date | null;
}
