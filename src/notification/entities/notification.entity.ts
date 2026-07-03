import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { NotificationType } from '../enums/notification-type.enum';

@Entity('notifications')
@Index(['userId', 'createdAt'], { unique: false })
export class Notification extends BaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  @Index()
  userId: string;

  @Column({ type: 'varchar' })
  type: NotificationType;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar' })
  body: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true, name: 'read_at' })
  readAt: Date | null;
}
