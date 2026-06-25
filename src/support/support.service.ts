import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketStatus } from './enums/ticket-status.enum';
import { PaginationService, PaginatedResult } from '../common/pagination';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepository: Repository<SupportTicket>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * GET /admin/support-tickets
   * Paginated ticket list with optional filters.
   */
  async findAll(
    filters: {
      ticketStatus?: TicketStatus;
      priority?: number;
      search?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<SupportTicket>> {
    const qb = this.ticketRepository.createQueryBuilder('t');

    if (filters.ticketStatus !== undefined && typeof filters.ticketStatus === 'number') {
      qb.andWhere('t.ticketStatus = :ticketStatus', { ticketStatus: filters.ticketStatus });
    }

    if (filters.priority !== undefined && typeof filters.priority === 'number') {
      qb.andWhere('t.priority = :priority', { priority: filters.priority });
    }

    if (filters.search) {
      qb.andWhere(
        '(LOWER(t.subject) LIKE :search OR LOWER(t.description) LIKE :search)',
        { search: `%${filters.search.toLowerCase()}%` },
      );
    }

    if (filters.dateFrom) {
      qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('t.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('t.createdAt', 'DESC');

    const skip = this.paginationService.getSkip(page, limit);
    const [items, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return this.paginationService.wrap(items, total, page, limit);
  }

  /**
   * PATCH /admin/support-tickets/:id
   * Update ticket status, priority, assignment, or notes.
   */
  async update(
    ticketId: string,
    updates: {
      ticketStatus?: TicketStatus;
      priority?: number;
      assignedTo?: string;
      notes?: string;
    },
  ): Promise<SupportTicket> {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    if (updates.ticketStatus !== undefined) {
      ticket.ticketStatus = updates.ticketStatus;

      // Auto-set resolvedAt when resolving
      if (updates.ticketStatus === TicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
      }
    }

    if (updates.priority !== undefined) {
      ticket.priority = updates.priority;
    }

    if (updates.assignedTo !== undefined) {
      ticket.assignedTo = updates.assignedTo;
    }

    if (updates.notes !== undefined) {
      ticket.notes = updates.notes;
    }

    return this.ticketRepository.save(ticket);
  }
}
