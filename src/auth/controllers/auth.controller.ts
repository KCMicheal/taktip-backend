import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AuthService } from "../services/auth.service";
import { InviteService } from "../../merchant/services/invite.service";
import { UserResponse } from "../services/auth.service";
import { Public } from "../decorators/public.decorator";
import { CurrentUser } from "../decorators/current-user.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import {
  RegisterMerchantDto,
  RegisterCustomerDto,
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
  Enable2FaDto,
  Disable2FaDto,
  Setup2FaResponseDto,
} from "../dto";
import { AcceptInviteDto } from "../../merchant/dto/invite.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly inviteService: InviteService,
  ) {}

  @Post("register/merchant")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register as a merchant" })
  @ApiResponse({
    status: 201,
    description: "Registration initiated, OTP sent to email",
    type: RegisterMerchantResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Email already registered",
    type: ErrorResponseDto,
  })
  async registerMerchant(@Body() dto: RegisterMerchantDto) {
    return this.authService.registerMerchant(dto);
  }

  @Post("register/customer")
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: "Register as a customer" })
  @ApiResponse({
    status: 201,
    description: "Registration initiated, OTP sent to email",
    type: RegisterMerchantResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid input",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Email already registered",
    type: ErrorResponseDto,
  })
  async registerCustomer(@Body() dto: RegisterCustomerDto) {
    return await this.authService.registerCustomer(dto);
  }

  @Post("register/staff")
  @HttpCode(HttpStatus.CREATED)
  @Public()
  @ApiOperation({ summary: "Register as staff using invite token" })
  @ApiResponse({
    status: 201,
    description: "Staff registration successful",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "success" },
        data: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                email: { type: "string", example: "staff@example.com" },
                role: { type: "string", example: "STAFF" },
              },
            },
            merchant: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                businessName: { type: "string", example: "Joe's Restaurant" },
              },
            },
          },
        },
        message: {
          type: "string",
          example: "Staff registration successful. You can now log in.",
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "Invalid or expired invite token",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Invalid invite token",
    type: ErrorResponseDto,
  })
  async registerStaff(@Body() dto: AcceptInviteDto) {
    const result = await this.inviteService.acceptInvite(dto);
    return {
      status: "success",
      data: {
        user: result.user,
        merchant: result.merchant,
      },
      message: "Staff registration successful. You can now log in.",
    };
  }

  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify OTP and complete registration" })
  @ApiResponse({
    status: 200,
    description: "Email verified, user activated",
    type: VerifyOtpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid or expired OTP",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
    type: ErrorResponseDto,
  })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post("resend-otp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend OTP to email" })
  @ApiResponse({
    status: 200,
    description: "New OTP sent to email",
    type: ResendOtpResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
    type: ErrorResponseDto,
  })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // Override: 5 requests per 15 minutes
  @ApiOperation({ summary: "Login with email/phone and password" })
  @ApiResponse({
    status: 200,
    description: "Login successful, returns tokens",
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Invalid credentials or email not verified",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests",
    type: ErrorResponseDto,
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: "Refresh access token using refresh token" })
  @ApiResponse({
    status: 200,
    description: "New tokens generated",
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Invalid or expired refresh token",
    type: ErrorResponseDto,
  })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: "Request password reset email" })
  @ApiResponse({
    status: 200,
    description: "Password reset email sent if account exists",
    type: ForgotPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid email or role",
    type: ErrorResponseDto,
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email, dto.role);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({ summary: "Reset password using token from email" })
  @ApiResponse({
    status: 200,
    description: "Password has been reset successfully",
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid or expired token",
    type: ErrorResponseDto,
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get("me")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user's profile" })
  @ApiResponse({
    status: 200,
    description: "User profile retrieved successfully",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "success" },
        data: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string" },
            phone: { type: "string", nullable: true },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true },
            role: { type: "string" },
            isVerified: { type: "boolean" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            merchant: { type: "object", nullable: true },
            staffProfiles: { type: "array", nullable: true },
            customerProfile: { type: "object", nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async getProfile(@CurrentUser() user: UserResponse) {
    const profile = await this.authService.getProfile(user.sub);
    return { status: "success", data: profile };
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change password for authenticated user" })
  @ApiResponse({
    status: 200,
    description: "Password changed successfully",
    type: ChangePasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid password format",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Current password is incorrect",
    type: ErrorResponseDto,
  })
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

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout and revoke refresh token" })
  @ApiResponse({
    status: 200,
    description: "Logged out successfully",
    type: LogoutResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Invalid refresh token",
    type: ErrorResponseDto,
  })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Headers("x-forwarded-for") forwardedIp: string,
    @CurrentUser() _user: UserResponse,
  ) {
    const ip = forwardedIp || "unknown";
    return this.authService.logout(dto, ip);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout from all devices" })
  @ApiResponse({
    status: 200,
    description: "Logged out from all devices",
    type: LogoutAllResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: ErrorResponseDto,
  })
  async logoutAll(@CurrentUser() user: UserResponse) {
    return this.authService.logoutAll(user.sub);
  }

  // ─────────────────────────────────────────────────────────────
  //  2FA (Two-Factor Authentication) — shared for all user types
  // ─────────────────────────────────────────────────────────────

  @Post("2fa/setup")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Generate 2FA setup secret + QR code + backup codes (all authenticated users)" })
  @ApiResponse({
    status: 200,
    description: "2FA setup data returned (secret, QR code, backup codes)",
    type: Setup2FaResponseDto,
  })
  @ApiResponse({ status: 409, description: "2FA already enabled" })
  async setup2FA(@CurrentUser() user: UserResponse) {
    const result = await this.authService.setup2FA(user.sub);
    return { status: "success", data: result };
  }

  @Post("2fa/enable")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Enable two-factor authentication after setup (all authenticated users)" })
  @ApiResponse({
    status: 200,
    description: "2FA enabled successfully",
  })
  @ApiResponse({ status: 400, description: "Validation error or setup not completed" })
  @ApiResponse({ status: 409, description: "2FA already enabled" })
  async enable2FA(
    @CurrentUser() user: UserResponse,
    @Body() dto: Enable2FaDto,
  ) {
    const result = await this.authService.enable2FA(
      user.sub,
      dto.password,
      dto.token,
    );
    return { status: "success", data: result };
  }

  @Post("2fa/disable")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Disable two-factor authentication (all authenticated users)" })
  @ApiResponse({
    status: 200,
    description: "2FA disabled successfully",
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  async disable2FA(
    @CurrentUser() user: UserResponse,
    @Body() dto: Disable2FaDto,
  ) {
    const result = await this.authService.disable2FA(
      user.sub,
      dto.password,
      dto.otp,
    );
    return { status: "success", data: result };
  }
}
