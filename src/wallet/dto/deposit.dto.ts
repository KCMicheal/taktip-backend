import { IsUUID, IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ example: 'wallet-uuid' })
  @IsUUID()
  walletId: string;

  @ApiProperty({ example: 5000.0, description: 'Amount to deposit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'DEP-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'Initial deposit' })
  @IsOptional()
  @IsString()
  description?: string;
}
