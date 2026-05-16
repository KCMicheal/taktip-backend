import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { Wallet } from './wallet.entity';

@Entity('transactions')
export class Transaction extends BaseEntity {
  @Column({ type: 'uuid' })
  walletId: string;

  @ManyToOne(() => Wallet, (w) => w.transactions)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column({
    type: 'int',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  fee: number;

  @Column({ type: 'varchar', unique: true })
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({
    type: 'int',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
    name: 'transactionStatus',
  })
  transactionStatus: TransactionStatus;
}
