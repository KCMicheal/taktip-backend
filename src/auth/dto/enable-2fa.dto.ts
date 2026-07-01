import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Enable2FaDto {
  @ApiProperty({
    description: 'Current password to verify identity before enabling 2FA',
    example: 'MySecureP@ss1',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: '6-digit TOTP code from authenticator app to verify the setup',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
