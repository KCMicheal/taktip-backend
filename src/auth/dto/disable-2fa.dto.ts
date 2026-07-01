import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Disable2FaDto {
  @ApiProperty({
    description: 'Current password to verify identity before disabling 2FA',
    example: 'MySecureP@ss1',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description: 'Optional OTP/token to verify 2FA ownership before disabling',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  otp?: string;
}
