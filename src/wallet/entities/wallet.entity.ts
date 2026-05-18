import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Transaction } from './transaction.entity';

@Entity('wallets')
export class Wallet extends BaseEntity {
  /**
   * Polymorphic owner — points to the entity that owns this wallet.
   * For merchants: ownerId = merchant.id
   * For staff: ownerId = staffProfile.id
   * For customers: ownerId = customerProfile.id
   * For independent providers: ownerId = independentProfile.id
   */
  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  /**
   * Owner type discriminator: 'merchant' | 'staff' | 'customer' | 'independent'
   */
  @Column({ type: 'varchar', name: 'owner_type' })
  ownerType: string;

  /**
   * Pending balance — awaiting PSP confirmation (locked, cannot withdraw).
   * Credits from PSP-driven payments land here first.
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'balance_pending' })
  balancePending: number;

  /**
   * Available balance — cleared, withdrawable.
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'balance_available' })
  balanceAvailable: number;

  /**
   * Processing balance — payout initiated, awaiting bank settlement.
   * Funds locked here during payout to prevent double-withdrawal.
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, name: 'balance_processing' })
  balanceProcessing: number;

  /**
   * Total balance convenience getter (computed, not stored).
   * Sum of pending + available + processing.
   */
  get totalBalance(): number {
    return this.balancePending + this.balanceAvailable + this.balanceProcessing;
  }

  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ type: 'timestamp', nullable: true, name: 'locked_until' })
  lockedUntil: Date | null;

  @OneToMany(() => Transaction, (tx) => tx.wallet)
  transactions: Transaction[];
}
