import { IsEmail, IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterMerchantDto {
  @ApiProperty({
    description: 'Merchant business email address',
    example: 'merchant@restaurant.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({
    description: 'Password must be at least 8 characters with uppercase, lowercase, and number',
    example: 'SecurePass123',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @ApiProperty({
    description: 'Business name',
    example: 'Golden Restaurant',
  })
  @IsString()
  @IsNotEmpty({ message: 'Business name is required' })
  businessName!: string;
}
