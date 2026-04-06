import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJFZERTQSJ9...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
