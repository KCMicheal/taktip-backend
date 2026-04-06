import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { UserResponse } from '../services/auth.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  RegisterMerchantDto,
  VerifyOtpDto,
  ResendOtpDto,
  LoginDto,
  RefreshTokenDto,
} from '../dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/merchant')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register as a merchant' })
  @ApiResponse({
    status: 201,
    description: 'Registration initiated, OTP sent to email',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async registerMerchant(@Body() dto: RegisterMerchantDto) {
    return this.authService.registerMerchant(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and complete registration' })
  @ApiResponse({
    status: 200,
    description: 'Email verified, user activated',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to email' })
  @ApiResponse({
    status: 200,
    description: 'New OTP sent to email',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Login with email/phone and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns tokens',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or email not verified' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'New tokens generated',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Headers('x-forwarded-for') forwardedIp: string,
    @CurrentUser() _user: UserResponse,
  ) {
    const ip = forwardedIp || 'unknown';
    return this.authService.logout(dto, ip);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices',
  })
  async logoutAll(@CurrentUser() user: UserResponse) {
    return this.authService.logoutAll(user.id);
  }
}
