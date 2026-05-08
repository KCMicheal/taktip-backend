import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../enums/role.enum';
import { swaggerEnumValues } from '../../common/helpers/enum-helper';

export class LoginDto {
  @ApiProperty({
    description: 'Email or phone number',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'User role for login',
    enum: swaggerEnumValues(Role),
    example: 'MERCHANT',
  })
  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;
}
