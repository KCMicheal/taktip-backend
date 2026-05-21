import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteStaffDto {
  @ApiProperty({
    description: 'Email address of the staff to invite',
    example: 'staff@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({
    description: 'Role within the business (default: STAFF)',
    example: 'STAFF',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  role?: string;

  @ApiPropertyOptional({
    description: 'Staff members full name (e.g. "Jane Doe")',
    example: 'Jane Doe',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Custom employee code / staff ID (e.g. EMP-001)',
    example: 'EMP-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;
}

export class AcceptInviteDto {
  @ApiProperty({
    description: 'Invite token from email',
    example: 'abc123xyz...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New user password',
    example: 'SecurePass123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(100)
  password: string;
}