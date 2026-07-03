import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ActivityType {
  ALL = 'all',
  TIPS = 'tips',
  WALLET = 'wallet',
}

export enum ActivityPeriod {
  ALL = 'all',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ description: 'Page number (default: 1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (default: 20, max: 100)', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ActivityType, description: 'Filter by activity source (default: all)' })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ApiPropertyOptional({ enum: ActivityPeriod, description: 'Filter by time period (default: all)' })
  @IsOptional()
  @IsEnum(ActivityPeriod)
  period?: ActivityPeriod;
}
