import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipDirection, TipPeriod, TipStatusFilter } from './tip-history-query.dto';

export class ExportTipsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by direction: sent, received, or all (default: all)',
    enum: ['sent', 'received', 'all'],
  })
  @IsOptional()
  @IsEnum(TipDirection)
  direction?: TipDirection;

  @ApiPropertyOptional({
    description: 'Filter by time period: 7d, 30d, 90d, or all (default: all)',
    enum: ['7d', '30d', '90d', 'all'],
  })
  @IsOptional()
  @IsEnum(TipPeriod)
  period?: TipPeriod;

  @ApiPropertyOptional({
    description: 'Filter by tip status: completed, pending, refunded, failed, or all (default: all)',
    enum: ['completed', 'pending', 'refunded', 'failed', 'all'],
  })
  @IsOptional()
  @IsEnum(TipStatusFilter)
  status?: TipStatusFilter;

  @ApiPropertyOptional({
    description: 'Export format (default: csv)',
    enum: ['csv'],
  })
  @IsOptional()
  @IsString()
  format?: string;
}
