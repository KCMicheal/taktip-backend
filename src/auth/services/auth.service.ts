import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from '../entities/user.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import {
  RegisterMerchantDto,
  VerifyOtpDto,
  ResendOtpDto,
  LoginDto,
  RefreshTokenDto,
} from '../dto';
import { OtpService } from './otp.service';
import { MailService } from './mail.service';
import { TokenService, TokenPair } from './token.service';
import { Role } from '../enums/role.enum';

export interface UserResponse {
  sub: string;
  email: string;
  phone: string | null;
  role: Role;
  isVerified: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds = 10;
  private readonly resetTokenExpiryHours = 1;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Initiate merchant registration
   * Creates user with hashed password and sends OTP
   */
  async registerMerchant(dto: RegisterMerchantDto): Promise<{ message: string }> {
    // Check if email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Generate OTP and hash
    const otp = this.otpService.generateOtp();
    const otpHash = await this.otpService.hashOtp(otp);
    const otpExpiry = this.otpService.getOtpExpiry();

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    // Create user
    const user = this.userRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      role: Role.MERCHANT,
      isEmailVerified: false,
      otpHash,
      otpExpiry,
    });

    await this.userRepository.save(user);

    // Send OTP email
    await this.mailService.sendOtpEmail(dto.email, otp, dto.businessName);

    return {
      message: 'Registration initiated. Please verify your email with the OTP sent.',
    };
  }

  /**
   * Verify OTP and activate user
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email already verified');
    }

    if (!user.otpHash || !user.otpExpiry) {
      throw new BadRequestException('No OTP requested. Please register first.');
    }

    if (this.otpService.isOtpExpired(user.otpExpiry)) {
      throw new UnauthorizedException('OTP has expired. Please request a new one.');
    }

    const isValid = await this.otpService.verifyOtp(dto.otp, user.otpHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Activate user and clear OTP
    user.isEmailVerified = true;
    user.otpHash = null;
    user.otpExpiry = null;

    await this.userRepository.save(user);

    // Send welcome email
    await this.mailService.sendWelcomeEmail(user.email, user.email.split('@')[0]);

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  /**
   * Resend OTP to user
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Generate new OTP
    const otp = this.otpService.generateOtp();
    const otpHash = await this.otpService.hashOtp(otp);
    const otpExpiry = this.otpService.getOtpExpiry();

    // Update user with new OTP
    user.otpHash = otpHash;
    user.otpExpiry = otpExpiry;

    await this.userRepository.save(user);

    // Send OTP email
    await this.mailService.sendOtpEmail(user.email, otp, user.email.split('@')[0]);

    return {
      message: 'New OTP sent to your email.',
    };
  }

  /**
   * Transform user entity to safe response object
   * Note: 'sub' is used instead of 'id' because JWT tokens use 'sub' as the subject identifier
   */
  private toUserResponse(user: User): UserResponse {
    return {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isEmailVerified,
    };
  }

  /**
   * Authenticate user and return tokens
   */
  async login(dto: LoginDto): Promise<TokenPair & { user: UserResponse }> {
    // Find user by email or phone
    const user = await this.userRepository.findOne({
      where: [
        { email: dto.identifier },
        { phone: dto.identifier },
      ],
    });

    // Return generic error to prevent user enumeration
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if role matches
    if (user.role !== dto.role) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Revoke old tokens for this user (same device login)
    await this.tokenService.revokeOldTokensForUser(user.id);

    // Generate new token pair
    const tokens = await this.tokenService.generateTokenPair(user.id, user.role);

    return {
      ...tokens,
      user: this.toUserResponse(user),
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(
    dto: RefreshTokenDto,
  ): Promise<TokenPair & { user: UserResponse }> {
    const result = await this.tokenService.refreshTokenPair(dto.refreshToken);

    if (!result) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Get user data using userId from result (avoid re-validation after revocation)
    const user = await this.userRepository.findOne({
      where: { id: result.userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      ...result.tokens,
      user: this.toUserResponse(user),
    };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(dto: RefreshTokenDto, ipAddress?: string): Promise<{ message: string }> {
    const revoked = await this.tokenService.revokeRefreshToken(
      dto.refreshToken,
      ipAddress,
    );

    if (!revoked) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      message: 'Logged out successfully',
    };
  }

  /**
   * Logout from all devices - revoke all refresh tokens for user
   */
  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.tokenService.revokeAllUserTokens(userId);

    return {
      message: 'Logged out from all devices',
    };
  }

  /**
   * Request password reset - generates token and sends email
   * Always returns success to prevent user enumeration attacks
   */
  async forgotPassword(email: string, role: Role): Promise<{ message: string }> {
    // Validate role is a valid enum value
    if (!role || !Object.values(Role).includes(role)) {
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }

    // Find user by email and role
    const user = await this.userRepository.findOne({
      where: { email, role },
    });

    // Always return success to prevent user enumeration
    // Even if user doesn't exist, we don't want to reveal that
    if (!user) {
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }

    // Generate secure reset token
    const resetToken = randomUUID();
    const resetTokenHash = await bcrypt.hash(resetToken, this.saltRounds);

    // Calculate expiry (1 hour from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.resetTokenExpiryHours);

    // Store reset token in database
    const passwordReset = this.passwordResetRepository.create({
      userId: user.id,
      tokenHash: resetTokenHash,
      expiresAt,
    });

    await this.passwordResetRepository.save(passwordReset);

    // Send password reset email (catch errors to prevent user enumeration)
    try {
      const userName = user.email.split('@')[0];
      await this.mailService.sendPasswordResetEmail(user.email, resetToken, userName);
    } catch (error) {
      // Log the error but don't reveal it to the caller
      this.logger.error(`Failed to send password reset email to ${user.email}`, error);
    }

    return {
      message: 'If an account exists with this email, a password reset link has been sent.',
    };
  }

  /**
   * Reset password using valid token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Find all valid (non-expired, not used) reset tokens
    const resetTokens = await this.passwordResetRepository
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.user', 'user')
      .where('pr.usedAt IS NULL')
      .getMany();

    // Find valid token
    let validToken: PasswordReset | null = null;
    for (const storedToken of resetTokens) {
      const isValid = await bcrypt.compare(token, storedToken.tokenHash);
      if (isValid && storedToken.expiresAt > new Date()) {
        validToken = storedToken;
        break;
      }
    }

    if (!validToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Validate user's role
    if (!validToken.user || !validToken.user.role || !Object.values(Role).includes(validToken.user.role)) {
      throw new BadRequestException('Invalid user account');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);

    // Update user password
    validToken.user.passwordHash = passwordHash;
    await this.userRepository.save(validToken.user);

    // Invalidate ALL reset tokens for this user (security: prevent older tokens from working)
    await this.passwordResetRepository.update(
      { userId: validToken.userId },
      { usedAt: new Date() },
    );

    // Revoke all refresh tokens to force re-login
    await this.tokenService.revokeAllUserTokens(validToken.userId);

    return {
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    userRole: Role,
  ): Promise<{ message: string }> {
    // Validate role is a valid enum value
    if (!userRole || !Object.values(Role).includes(userRole)) {
      throw new BadRequestException('Invalid user role');
    }

    // Find user by id
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash and save new password
    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);
    user.passwordHash = passwordHash;
    await this.userRepository.save(user);

    // Optionally revoke all refresh tokens to force re-login on all devices
    // Commented out to allow user to stay logged in on current device
    // await this.tokenService.revokeAllUserTokens(userId);

    return {
      message: 'Password changed successfully.',
    };
  }
}
