import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token (optional if sent via httpOnly cookie)',
    example: 'eyJhbGciOiJFZERTQSJ9...',
    required: false,
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
