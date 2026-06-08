import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsObject,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShiftDto {
  @ApiProperty({
    description: 'Shift name (e.g. "Morning Shift", "Friday Night")',
    example: 'Morning Shift',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Shift start time (ISO 8601)',
    example: '2026-06-04T08:00:00Z',
  })
  @IsDateString()
  startsAt: string;

  @ApiProperty({
    description: 'Shift end time (ISO 8601)',
    example: '2026-06-04T16:00:00Z',
  })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({
    description: 'Staff profile IDs to assign to this shift',
    example: ['uuid-of-staff-1', 'uuid-of-staff-2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  staffProfileIds?: string[];

  @ApiPropertyOptional({
    description: 'Tip distribution policy (JSONB)',
    example: { type: 'pool', split: 'equal' },
  })
  @IsOptional()
  @IsObject()
  distributionPolicy?: Record<string, unknown>;
}
