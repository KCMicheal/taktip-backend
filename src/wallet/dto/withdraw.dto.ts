import { IsUUID, IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WithdrawDto {
  @ApiProperty({ example: 'wallet-uuid' })
  @IsUUID()
  walletId: string;

  @ApiProperty({ example: 2000.0, description: 'Amount to withdraw' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'WTH-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'Cash withdrawal' })
  @IsOptional()
  @IsString()
  description?: string;
}
