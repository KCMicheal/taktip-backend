import { IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClockInDto {
  @ApiProperty({
    description: 'Shift ID to clock in for',
    example: 'uuid-of-shift',
  })
  @IsUUID()
  shiftId: string;

  @ApiPropertyOptional({
    description: 'Optional table number assigned to staff',
    example: 'Table 5',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tableNumber?: string;
}
