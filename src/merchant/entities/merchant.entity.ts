import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { BusinessType } from '../../common/enums/business-type.enum';
import { User } from '../../auth/entities/user.entity';
import { KycStatus } from '../enums/kyc-status.enum';

@Entity('merchants')
export class Merchant extends BaseEntity {
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  shortCode: string;

  @Column({
    type: 'int',
    enum: BusinessType,
    nullable: true,
  })
  businessType: BusinessType | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Column({ type: 'varchar', nullable: true })
  zip: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'NG' })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', default: 'Africa/Lagos' })
  timezone: string;

  @Column({ type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({
    type: 'int',
    default: KycStatus.PENDING,
  })
  kycStatus: KycStatus;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;
}