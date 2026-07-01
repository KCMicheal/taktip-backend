import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationParamsDto } from '../../common/pagination';

/**
 * Direction filter: sent, received, or all.
 */
export enum TipDirection {
  SENT = 'sent',
  RECEIVED = 'received',
  ALL = 'all',
}

/**
 * Period filter: 7d, 30d, 90d, or all.
 */
export enum TipPeriod {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  ALL = 'all',
}

/**
 * Status filter: completed, pending, refunded, failed, or all.
 */
export enum TipStatusFilter {
  COMPLETED = 'completed',
  PENDING = 'pending',
  REFUNDED = 'refunded',
  FAILED = 'failed',
  ALL = 'all',
}

/**
 * Query params DTO for GET /customer/tips/history.
 *
 * Extends standard pagination with optional server-side filters:
 * - direction: sent | received | all (default: all)
 * - period:    7d | 30d | 90d | all  (default: all)
 * - status:    completed | pending | refunded | failed | all (default: all)
 */
export class TipHistoryQueryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Filter by direction: sent, received, or all (default: all)',
    enum: TipDirection,
    default: TipDirection.ALL,
  })
  @IsOptional()
  @IsEnum(TipDirection)
  direction?: TipDirection = TipDirection.ALL;

  @ApiPropertyOptional({
    description: 'Filter by time period: 7d, 30d, 90d, or all (default: all)',
    enum: TipPeriod,
    default: TipPeriod.ALL,
  })
  @IsOptional()
  @IsEnum(TipPeriod)
  period?: TipPeriod = TipPeriod.ALL;

  @ApiPropertyOptional({
    description: 'Filter by tip status: completed, pending, refunded, failed, or all (default: all)',
    enum: TipStatusFilter,
    default: TipStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(TipStatusFilter)
  status?: TipStatusFilter = TipStatusFilter.ALL;
}
