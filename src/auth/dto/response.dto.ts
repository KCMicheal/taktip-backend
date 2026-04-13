import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto {
  @ApiProperty({ example: 'Success message' })
  message: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 'Error message' })
  message: string | string[];

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 400 })
  statusCode: number;
}

export class AuthTokensDto {
  @ApiProperty({
    example: 'eyJhbGciOiJFZERTQSJ9...',
    description: 'JWT access token',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJFZERTQSJ9...',
    description: 'JWT refresh token',
  })
  refreshToken: string;

  @ApiProperty({ example: 900 })
  expiresIn: number;
}

export class RegisterMerchantResponseDto {
  @ApiProperty({ example: 'OTP sent to merchant@restaurant.com' })
  message: string;

  @ApiProperty({ example: 'merchant@restaurant.com' })
  email: string;
}

export class VerifyOtpResponseDto {
  @ApiProperty({ example: 'Email verified successfully. You can now login.' })
  message: string;

  @ApiProperty({
    example: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'merchant@restaurant.com',
      role: 'MERCHANT',
    },
  })
  user: object;
}

export class ResendOtpResponseDto {
  @ApiProperty({ example: 'New OTP sent to merchant@restaurant.com' })
  message: string;
}

export class LoginResponseDto extends AuthTokensDto {}

export class RefreshTokenResponseDto extends AuthTokensDto {}

export class LogoutResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}

export class LogoutAllResponseDto {
  @ApiProperty({ example: 'Logged out from all devices' })
  message: string;
}
