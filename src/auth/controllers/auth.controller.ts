import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { UserResponse } from '../services/auth.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  RegisterMerchantDto,
  VerifyOtpDto,
  ResendOtpDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  RegisterMerchantResponseDto,
  VerifyOtpResponseDto,
  ResendOtpResponseDto,
  LoginResponseDto,
  RefreshTokenResponseDto,
  LogoutResponseDto,
  LogoutAllResponseDto,
  ForgotPasswordResponseDto,
  ResetPasswordResponseDto,
  ChangePasswordResponseDto,
  ErrorResponseDto,
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
    type: RegisterMerchantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered', type: ErrorResponseDto })
  async registerMerchant(@Body() dto: RegisterMerchantDto) {
    return this.authService.registerMerchant(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and complete registration' })
  @ApiResponse({
    status: 200,
    description: 'Email verified, user activated',
    type: VerifyOtpResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to email' })
  @ApiResponse({
    status: 200,
    description: 'New OTP sent to email',
    type: ResendOtpResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
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
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or email not verified', type: ErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Too many requests', type: ErrorResponseDto })
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
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token', type: ErrorResponseDto })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if account exists',
    type: ForgotPasswordResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid email or role', type: ErrorResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email, dto.role);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: 'Reset password using token from email' })
  @ApiResponse({
    status: 200,
    description: 'Password has been reset successfully',
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token', type: ErrorResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    type: ChangePasswordResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid password format', type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Current password is incorrect', type: ErrorResponseDto })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: UserResponse,
  ) {
    return this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
      user.role,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: LogoutResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token', type: ErrorResponseDto })
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices',
    type: LogoutAllResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ErrorResponseDto })
  async logoutAll(@CurrentUser() user: UserResponse) {
    return this.authService.logoutAll(user.sub);
  }
}
