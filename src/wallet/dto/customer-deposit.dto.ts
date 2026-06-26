import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for initiating a Paystack wallet deposit.
 * walletId is implicit (the customer's own wallet).
 * Paystack generates the transaction reference automatically.
 */
export class CustomerDepositDto {
  @ApiProperty({ example: 5000.0, description: 'Amount to deposit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}
