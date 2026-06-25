import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TicketStatus } from '../enums/ticket-status.enum';
import { TicketPriority } from '../enums/ticket-priority.enum';

@Entity('support_tickets')
export class SupportTicket extends BaseEntity {
  @Column({ type: 'uuid', nullable: true, name: 'merchant_id' })
  merchantId: string | null;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int', enum: TicketStatus, default: TicketStatus.OPEN })
  ticketStatus: TicketStatus;

  @Column({ type: 'int', enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Column({ type: 'uuid', nullable: true, name: 'assigned_to' })
  assignedTo: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'resolved_at' })
  resolvedAt: Date | null;
}
