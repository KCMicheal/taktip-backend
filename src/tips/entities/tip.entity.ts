import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipSource } from '../enums/tip-source.enum';
import { TipStatus } from '../enums/tip-status.enum';
import { C2cTipSenderType } from '../enums/c2c-tip-sender-type.enum';
import { C2cTipFundingSource } from '../enums/c2c-tip-funding-source.enum';

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

  // ── Customer-to-Customer fields ──

  /** The profile ID of the customer who SENT this tip (null for staff tips) */
  @Column({ type: 'uuid', nullable: true, name: 'sender_id' })
  senderId: string | null;

  /** Whether the sender is a registered customer or an unregistered guest */
  @Column({ type: 'int', nullable: true, name: 'sender_type' })
  senderType: C2cTipSenderType | null;

  /** The recipient type: 'customer' for C2C tips, null for staff tips */
  @Column({ type: 'varchar', nullable: true, name: 'recipient_type' })
  recipientType: string | null;

  /** How the tip was funded: WALLET (from balance) or CARD (via Paystack) */
  @Column({ type: 'int', nullable: true, name: 'funding_source' })
  fundingSource: C2cTipFundingSource | null;

  /** The sender's wallet ID (for wallet-funded C2C tips) */
  @Column({ type: 'uuid', nullable: true, name: 'sender_wallet_id' })
  senderWalletId: string | null;
}
