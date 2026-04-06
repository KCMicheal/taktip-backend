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
import { RegisterMerchantDto, VerifyOtpDto, ResendOtpDto } from '../dto';
import { OtpService } from './otp.service';
import { MailService } from './mail.service';
import { Role } from '../enums/role.enum';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
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
}
