import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationParamsDto } from '../../common/pagination/pagination-params.dto';

/**
 * Query params for listing audit log entries.
 */
export class AuditFilterDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Filter by action (e.g., MERCHANT_APPROVE, MERCHANT_SUSPEND)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by entity type (e.g., merchant, user, support_ticket)' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Filter by entity UUID' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string, inclusive)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string, inclusive)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
