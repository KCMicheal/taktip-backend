import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GenerateQrCodeDto {
  @ApiPropertyOptional({
    description: 'Staff profile ID for staff-specific QR',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  staffProfileId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { tableNumber: 5, location: 'Main Hall' },
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
