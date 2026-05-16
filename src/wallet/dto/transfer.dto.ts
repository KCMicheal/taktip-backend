import { IsUUID, IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferDto {
  @ApiProperty({ example: 'source-wallet-uuid' })
  @IsUUID()
  sourceWalletId: string;

  @ApiProperty({ example: 'dest-wallet-uuid' })
  @IsUUID()
  destinationWalletId: string;

  @ApiProperty({ example: 1000.0, description: 'Amount to transfer' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'Staff payout' })
  @IsOptional()
  @IsString()
  description?: string;
}
