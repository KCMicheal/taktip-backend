import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { Merchant } from './merchant.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('staff_invites')
@Index(['token'], { unique: true })
@Index(['email', 'merchantId'], { unique: true })
export class StaffInvite extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  token: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'uuid' })
  merchantId: string;

  @ManyToOne(() => Merchant)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @Column({ type: 'uuid', nullable: true })
  inviteeId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'inviteeId' })
  invitee: User | null;

  @Column({ type: 'uuid' })
  invitedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invitedById' })
  invitedBy: User;

  @Column({
    type: 'int',
    enum: InviteStatus,
    default: InviteStatus.PENDING,
  })
  status: InviteStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  role: string | null;
}