import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayoutResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 5000 })
  amount: number;

  @ApiProperty({ example: 50 })
  fee: number;

  @ApiProperty({ example: 4950 })
  netAmount: number;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ example: 'POUT-1712345678-abcd1234' })
  reference: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  processedAt?: Date;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;
}
