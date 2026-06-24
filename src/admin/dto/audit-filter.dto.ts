import { IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../common/pagination/pagination-params.dto';

/**
 * Query params for listing audit log entries.
 */
export class AuditFilterDto extends PaginationParamsDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
