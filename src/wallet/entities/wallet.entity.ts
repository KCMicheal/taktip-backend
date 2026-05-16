import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { Transaction } from './transaction.entity';

@Entity('wallets')
export class Wallet extends BaseEntity {
  @Column({ type: 'uuid', unique: true })
  merchantId: string;

  @ManyToOne(() => Merchant)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  @OneToMany(() => Transaction, (tx) => tx.wallet)
  transactions: Transaction[];
}
