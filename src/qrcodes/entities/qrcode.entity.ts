import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('qr_codes')
export class QrCode extends BaseEntity {
  @Column({ type: 'uuid', name: 'merchant_id' })
  merchantId: string;

  @Column({ type: 'uuid', nullable: true, name: 'staff_profile_id' })
  staffProfileId: string | null;

  @Column({ type: 'varchar', unique: true, name: 'short_code' })
  shortCode: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
