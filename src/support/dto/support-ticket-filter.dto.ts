import { IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationParamsDto } from '../../common/pagination/pagination-params.dto';
import { TicketStatus } from '../enums/ticket-status.enum';
import { TicketPriority } from '../enums/ticket-priority.enum';

/**
 * Query params for listing support tickets.
 */
export class SupportTicketFilterDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Filter by status (1=OPEN, 2=IN_PROGRESS, 3=RESOLVED, 4=CLOSED)' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  ticketStatus?: TicketStatus;

  @ApiPropertyOptional({ description: 'Filter by priority (1=LOW, 2=MEDIUM, 3=HIGH, 4=URGENT)' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Search by subject or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by creation date (ISO string, inclusive)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by creation date (ISO string, inclusive)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
