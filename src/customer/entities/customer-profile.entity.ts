import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('customer_profiles')
export class CustomerProfile extends BaseEntity {
  @Column({ type: 'uuid', unique: true })
  @Index({ unique: true })
  userId: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Display name shown to other customers when receiving/sending tips.
   * Falls back to user's first name if null.
   */
  @Column({ type: 'varchar', nullable: true, name: 'display_name' })
  displayName: string | null;

  /**
   * Avatar image URL for customer profile.
   */
  @Column({ type: 'varchar', nullable: true, name: 'avatar_url' })
  avatarUrl: string | null;
}
