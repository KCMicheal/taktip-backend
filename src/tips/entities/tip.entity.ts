import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipSource } from '../enums/tip-source.enum';
import { TipStatus } from '../enums/tip-status.enum';

@Entity('tips')
export class Tip extends BaseEntity {
  @Column({ type: 'uuid', nullable: true, name: 'transaction_id' })
  transactionId: string | null;

  @Column({ type: 'uuid', name: 'merchant_id' })
  merchantId: string;

  @Column({ type: 'uuid', name: 'staff_profile_id' })
  staffProfileId: string;

  @Column({ type: 'uuid', nullable: true, name: 'customer_profile_id' })
  customerProfileId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  message: string | null;

  @Column({ type: 'int', nullable: true })
  rating: number | null;

  @Column({ type: 'int', enum: TipSource })
  source: TipSource;

  @Column({ type: 'int', enum: TipStatus, default: TipStatus.COMPLETED })
  tipStatus: TipStatus;

  @Column({ type: 'uuid', nullable: true, name: 'qr_code_id' })
  qrCodeId: string | null;
}
