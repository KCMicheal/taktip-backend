import { IsOptional, IsString } from 'class-validator';
import { PaginationParamsDto } from '../../common/pagination/pagination-params.dto';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query params for the admin analytics endpoint.
 * dateFrom is required; dateTo defaults to now if omitted.
 */
export class AnalyticsFilterDto extends PaginationParamsDto {
  @ApiProperty({
    description: 'Start date (ISO 8601, inclusive)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsString()
  dateFrom: string;

  @ApiProperty({
    description: 'End date (ISO 8601, inclusive). Defaults to current time.',
    required: false,
    example: '2026-06-24T23:59:59.999Z',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
