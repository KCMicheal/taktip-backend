import { IsEmail, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../enums/role.enum';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address of the user',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({
    description: 'User role (MERCHANT, STAFF, or ADMIN)',
    enum: Role,
    example: 'MERCHANT',
  })
  @IsEnum(Role, { message: 'Role must be one of: MERCHANT, STAFF, ADMIN' })
  @IsNotEmpty({ message: 'Role is required' })
  role!: Role;
}
