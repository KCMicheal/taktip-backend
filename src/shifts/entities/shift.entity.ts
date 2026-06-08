import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { ShiftStatus } from '../enums/shift-status.enum';

@Entity('shifts')
@Index(['merchantId'])
@Index(['status'])
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  merchantId: string;

  @ManyToOne(() => Merchant, { eager: true })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'timestamp' })
  startsAt: Date;

  @Column({ type: 'timestamp' })
  endsAt: Date;

  @Column({
    type: 'integer',
    default: ShiftStatus.DRAFT,
  })
  status: ShiftStatus;

  @Column({ type: 'jsonb', nullable: true })
  distributionPolicy: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
