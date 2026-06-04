import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TipResponseDto {
  @ApiProperty({ example: 'b1c2d3e4-f5a6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 500.0 })
  amount: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiPropertyOptional({ example: 'Great service!' })
  message?: string;

  @ApiPropertyOptional({ example: 5 })
  rating?: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: 'John Doe' })
  staffName?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'QR code UUID that initiated this tip' })
  qrCodeId?: string | null;
}
