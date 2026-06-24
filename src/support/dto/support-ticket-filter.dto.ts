import { IsOptional, IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationParamsDto } from '../../common/pagination/pagination-params.dto';
import { TicketStatus } from '../enums/ticket-status.enum';

/**
 * Query params for listing support tickets.
 */
export class SupportTicketFilterDto extends PaginationParamsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ticketStatus?: TicketStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
