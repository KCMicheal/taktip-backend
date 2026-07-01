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
}
