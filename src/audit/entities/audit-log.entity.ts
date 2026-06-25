import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Immutable audit trail for admin actions.
 *
 * Every time an admin performs a write action (approve, suspend, deactivate, etc.)
 * a row is inserted here. The log is append-only — never updated or deleted.
 */
@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ type: 'uuid', name: 'admin_id' })
  adminId: string;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'varchar', length: 50, name: 'entity_type' })
  entityType: string;

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true, name: 'ip_address' })
  ipAddress: string | null;
}
