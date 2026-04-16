import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString({ message: 'Token is required' })
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;

  @ApiProperty({
    description: 'New password (min 8 chars, must contain uppercase, lowercase, and number)',
    example: 'NewSecurePass123',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one lowercase, one uppercase, and one number',
  })
  newPassword!: string;
}
