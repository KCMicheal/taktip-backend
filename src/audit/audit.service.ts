import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { PaginationService, PaginatedResult } from '../common/pagination';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Record an admin action in the audit trail.
   * This is append-only — entries should never be modified after creation.
   */
  async log(params: {
    adminId: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<AuditLog> {
    const entry = this.auditLogRepository.create({
      adminId: params.adminId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
    });

    const saved = await this.auditLogRepository.save(entry);
    this.logger.debug(`Audit log: ${params.action} on ${params.entityType}(${params.entityId}) by admin ${params.adminId}`);
    return saved;
  }

  /**
   * GET /admin/audit-log
   * Paginated audit trail, filterable by action, entityType, entityId, and date range.
   */
  async findAll(
    filters: {
      action?: string;
      entityType?: string;
      entityId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<AuditLog>> {
    const qb = this.auditLogRepository.createQueryBuilder('a');

    if (filters.action) {
      qb.andWhere('a.action = :action', { action: filters.action });
    }

    if (filters.entityType) {
      qb.andWhere('a.entityType = :entityType', { entityType: filters.entityType });
    }

    if (filters.entityId) {
      qb.andWhere('a.entityId = :entityId', { entityId: filters.entityId });
    }

    if (filters.dateFrom) {
      qb.andWhere('a.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('a.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('a.createdAt', 'DESC');

    const skip = this.paginationService.getSkip(page, limit);
    const [items, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return this.paginationService.wrap(items, total, page, limit);
  }
}
