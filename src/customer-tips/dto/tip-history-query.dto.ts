import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
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
 * - period:    number of days (1-365) to look back, omit for all
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
    description: 'Filter by time period: number of days (1-365) to look back. Omit for all time.',
    example: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  period?: number;

  @ApiPropertyOptional({
    description: 'Filter by tip status: completed, pending, refunded, failed, or all (default: all)',
    enum: TipStatusFilter,
    default: TipStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(TipStatusFilter)
  status?: TipStatusFilter = TipStatusFilter.ALL;
}
