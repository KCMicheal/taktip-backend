import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBase64Image } from '../../common/validators/is-base64-image.validator';

export class RegisterCustomerDto {
  @ApiProperty({
    description: 'Customer first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({
    description: 'Customer last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @ApiProperty({
    description: 'Customer email address',
    example: 'john@example.com',
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

  @ApiPropertyOptional({
    description: 'Phone number (optional)',
    example: '+2348012345678',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Base64-encoded avatar image (max 512×512px, 500KB). Formats: png, jpeg, webp.',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsOptional()
  @IsBase64Image(
    { maxWidth: 512, maxHeight: 512, maxSizeKb: 500 },
    { message: 'Avatar must be a valid base64 image (png/jpeg/webp) no larger than 512x512px and 500KB' },
  )
  avatar?: string;
}
