import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../auth/entities/user.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';

@Entity('staff_profiles')
@Index(['userId'], { unique: true })
@Index(['merchantId', 'userId'])
export class StaffProfile extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  merchantId: string | null;

  @ManyToOne(() => Merchant, { nullable: true, eager: true })
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant | null;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', nullable: true })
  roleTag: string | null;

  @Column({ type: 'boolean', default: false })
  isClockedIn: boolean;

  @Column({ type: 'uuid', nullable: true })
  currentShiftId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payoutMethod: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, unknown> | null;
}
