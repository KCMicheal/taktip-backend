import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayoutMethodDto {
  @ApiProperty({
    description: 'Bank account number',
    example: '0123456789',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  accountNumber: string;

  @ApiProperty({
    description: 'Bank code (e.g. Paystack bank code)',
    example: '058',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  bankCode: string;

  @ApiProperty({
    description: 'Bank name',
    example: 'GTBank',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bankName: string;

  @ApiPropertyOptional({
    description: 'Account holder name (if different from display name)',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountHolderName?: string;
}
