import { IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for depositing into the customer's own wallet.
 * walletId is implicit (the customer's own wallet) and not required here.
 */
export class CustomerDepositDto {
  @ApiProperty({ example: 5000.0, description: 'Amount to deposit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'DEP-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'Pre-funding wallet' })
  @IsOptional()
  @IsString()
  description?: string;
}
