import { Entity, Column, ManyToOne, JoinColumn, ValueTransformer } from 'typeorm';

/**
 * Transforms decimal values from Postgres (returned as strings by pg driver)
 * into JavaScript numbers.
 */
const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null =>
    value !== null ? parseFloat(value) : null,
};
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

  @Column({ type: 'decimal', precision: 15, scale: 2, transformer: decimalTransformer })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalTransformer })
  fee: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'balance_before', transformer: decimalTransformer })
  balanceBefore: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'balance_after', transformer: decimalTransformer })
  balanceAfter: number | null;

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
