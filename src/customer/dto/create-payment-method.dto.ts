import { IsString, IsNotEmpty, IsIn, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentMethodDto {
  @ApiProperty({
    description: 'Type of payment method',
    enum: ['card', 'bank'],
    example: 'bank',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['card', 'bank'])
  type: 'card' | 'bank';

  @ApiProperty({
    description: 'Payment method details (bank account or card info)',
    example: {
      bankName: 'Chase Bank',
      bankCode: '021000021',
      accountNumber: '1234567890',
      accountHolderName: 'John Doe',
    },
  })
  @IsObject()
  details: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Display label for this payment method',
    example: 'My Checking Account',
  })
  @IsString()
  @IsNotEmpty()
  label?: string;
}
