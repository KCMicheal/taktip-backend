import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
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
  id: string;
  email: string;
  phone: string | null;
  role: Role;
  isVerified: boolean;
}

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
   */
  private toUserResponse(user: User): UserResponse {
    return {
      id: user.id,
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
}
