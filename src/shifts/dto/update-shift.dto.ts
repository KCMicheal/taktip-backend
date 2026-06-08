import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsObject,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateShiftDto {
  @ApiPropertyOptional({
    description: 'Shift name',
    example: 'Evening Shift',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Shift start time (ISO 8601)',
    example: '2026-06-04T17:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Shift end time (ISO 8601)',
    example: '2026-06-04T23:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description: 'Shift status (1=Draft, 2=Published, 3=InProgress, 4=Completed, 5=Cancelled)',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  status?: number;

  @ApiPropertyOptional({
    description: 'Staff profile IDs to add to this shift',
    example: ['uuid-of-staff-3'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  addStaffProfileIds?: string[];

  @ApiPropertyOptional({
    description: 'Staff profile IDs to remove from this shift',
    example: ['uuid-of-staff-1'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  removeStaffProfileIds?: string[];

  @ApiPropertyOptional({
    description: 'Tip distribution policy (JSONB)',
    example: { type: 'pool', split: 'equal' },
  })
  @IsOptional()
  @IsObject()
  distributionPolicy?: Record<string, unknown>;
}
