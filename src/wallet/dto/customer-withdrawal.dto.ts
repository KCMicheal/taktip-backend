import { IsNumber, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for a customer wallet withdrawal request.
 *
 * The customer selects an already-saved payment method (bank account)
 * by its ID from their saved payment methods.
 * The withdrawal amount is deducted from their available balance.
 */
export class CustomerWithdrawalDto {
  @ApiProperty({ example: 5000.0, description: 'Amount to withdraw' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100) // Minimum 100 NGN (or the smallest reasonable withdrawal)
  amount: number;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID of the saved bank account payment method',
  })
  @IsUUID()
  paymentMethodId: string;
}
