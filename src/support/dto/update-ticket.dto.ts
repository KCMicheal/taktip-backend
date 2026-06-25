import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus } from '../enums/ticket-status.enum';
import { TicketPriority } from '../enums/ticket-priority.enum';

/**
 * Request body for PATCH /admin/support-tickets/:id.
 * All fields are optional — only provided fields will be updated.
 */
export class UpdateTicketDto {
  @ApiPropertyOptional({ description: 'New ticket status', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  ticketStatus?: TicketStatus;

  @ApiPropertyOptional({ description: 'New priority level', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Admin UUID to assign', example: 'uuid' })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Internal admin notes', example: 'Working on this with the merchant' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
