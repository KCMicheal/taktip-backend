import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PayoutStatus } from '../enums/payout-status.enum';

@Entity('payouts')
export class Payout extends BaseEntity {
  @Column({ type: 'uuid', name: 'staff_profile_id' })
  staffProfileId: string;

  @Column({ type: 'uuid', nullable: true, name: 'merchant_id' })
  @Index()
  merchantId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  fee: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'net_amount' })
  netAmount: number;

  @Column({ type: 'jsonb', name: 'bank_account' })
  bankAccount: Record<string, unknown>;

  @Column({
    type: 'int',
    enum: PayoutStatus,
    default: PayoutStatus.PENDING,
    name: 'payout_status',
  })
  payoutStatus: PayoutStatus;

  @Column({ type: 'varchar', unique: true })
  reference: string;

  @Column({ type: 'uuid', nullable: true, name: 'admin_id' })
  adminId: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'processed_at' })
  processedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;
}
