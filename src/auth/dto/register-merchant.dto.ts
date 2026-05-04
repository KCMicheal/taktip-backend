import { IsEmail, IsNotEmpty, IsString, MinLength, Matches, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BusinessType } from '../../common/enums/business-type.enum';

export class RegisterMerchantDto {
  @ApiProperty({
    description: 'Merchant first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({
    description: 'Merchant last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

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

  @ApiProperty({
    description: 'Phone number',
    example: '+2348012345678',
    required: false,
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({
    description: 'Business type',
    enum: BusinessType,
    example: BusinessType.RESTAURANT,
    required: false,
  })
  @IsEnum(BusinessType)
  @IsOptional()
  businessType?: BusinessType;

  @ApiProperty({
    description: 'Business address',
    example: '123 Main St, Lagos',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;
}
