/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '@/auth/services/auth.service';
import { OtpService } from '@/auth/services/otp.service';
import { MailService } from '@/auth/services/mail.service';
import { TokenService } from '@/auth/services/token.service';
import { User } from '@/auth/entities/user.entity';
import { PasswordReset } from '@/auth/entities/password-reset.entity';
import { Role } from '@/auth/enums/role.enum';

jest.mock('bcrypt');
jest.mock('jose');
jest.mock('crypto', () => {
  const original = jest.requireActual('crypto');
  return {
    ...original,
    randomUUID: jest.fn(() => 'mock-uuid-1234'),
  } as { [key: string]: unknown };
});

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let passwordResetRepository: jest.Mocked<Repository<PasswordReset>>;
  let otpService: jest.Mocked<OtpService>;
  let mailService: jest.Mocked<MailService>;
  let tokenService: jest.Mocked<TokenService>;

  const mockUser: Partial<User> = {
    id: 'test-uuid',
    firstName: 'John',
    lastName: 'Doe',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    role: Role.MERCHANT,
    isEmailVerified: false,
    otpHash: 'hashedOtp',
    otpExpiry: new Date(Date.now() + 900000), // 15 minutes from now
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PasswordReset),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getMany: jest.fn(),
            })),
          },
        },
        {
          provide: OtpService,
          useValue: {
            generateOtp: jest.fn(),
            hashOtp: jest.fn(),
            verifyOtp: jest.fn(),
            getOtpExpiry: jest.fn(),
            isOtpExpired: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendOtpEmail: jest.fn(),
            sendWelcomeEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateTokenPair: jest.fn(),
            refreshTokenPair: jest.fn(),
            revokeRefreshToken: jest.fn(),
            revokeAllUserTokens: jest.fn(),
            revokeOldTokensForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    passwordResetRepository = module.get(getRepositoryToken(PasswordReset));
    otpService = module.get(OtpService);
    mailService = module.get(MailService);
    tokenService = module.get(TokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerMerchant', () => {
    const registerDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'merchant@example.com',
      password: 'SecurePass123',
      businessName: 'Test Restaurant',
    };

    it('should successfully register a new merchant', async () => {
      userRepository.findOne.mockResolvedValue(null);
      otpService.generateOtp.mockReturnValue('123456');
      otpService.hashOtp.mockResolvedValue('hashedOtp');
      otpService.getOtpExpiry.mockReturnValue(new Date(Date.now() + 900000));
      userRepository.create.mockReturnValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);
      mailService.sendOtpEmail.mockResolvedValue(undefined);

      const result = await authService.registerMerchant(registerDto);

      expect(result.message).toBe('Registration initiated. Please verify your email with the OTP sent.');
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: registerDto.email } });
      expect(otpService.generateOtp).toHaveBeenCalled();
      expect(otpService.hashOtp).toHaveBeenCalledWith('123456');
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith(registerDto.email, '123456', registerDto.businessName);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);

      await expect(authService.registerMerchant(registerDto)).rejects.toThrow(ConflictException);
      await expect(authService.registerMerchant(registerDto)).rejects.toThrow('Email already registered');
    });
  });

  describe('verifyOtp', () => {
    const verifyDto = {
      email: 'test@example.com',
      otp: '123456',
    };

    it('should successfully verify OTP and activate user', async () => {
      const unverifiedUser = { ...mockUser, isEmailVerified: false, otpHash: 'hashedOtp', otpExpiry: new Date(Date.now() + 900000) };
      userRepository.findOne.mockResolvedValue(unverifiedUser as User);
      otpService.isOtpExpired.mockReturnValue(false);
      otpService.verifyOtp.mockResolvedValue(true);
      userRepository.save.mockResolvedValue({ ...unverifiedUser, isEmailVerified: true } as User);
      mailService.sendWelcomeEmail.mockResolvedValue(undefined);

      const result = await authService.verifyOtp(verifyDto);

      expect(result.message).toBe('Email verified successfully. You can now log in.');
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: verifyDto.email } });
      expect(otpService.verifyOtp).toHaveBeenCalledWith('123456', 'hashedOtp');
      expect(mailService.sendWelcomeEmail).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow(NotFoundException);
      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow('User not found');
    });

    it('should throw BadRequestException if email already verified', async () => {
      const verifiedUser = { ...mockUser, isEmailVerified: true };
      userRepository.findOne.mockResolvedValue(verifiedUser as User);

      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow(BadRequestException);
      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow('Email already verified');
    });

    it('should throw BadRequestException if no OTP was requested', async () => {
      const userWithoutOtp = { ...mockUser, isEmailVerified: false, otpHash: null, otpExpiry: null };
      userRepository.findOne.mockResolvedValue(userWithoutOtp as User);

      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow(BadRequestException);
      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow('No OTP requested');
    });

    it('should throw UnauthorizedException if OTP is expired', async () => {
      const userWithExpiredOtp = { ...mockUser, isEmailVerified: false, otpExpiry: new Date(Date.now() - 1000) };
      userRepository.findOne.mockResolvedValue(userWithExpiredOtp as User);
      otpService.isOtpExpired.mockReturnValue(true);

      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow('OTP has expired');
    });

    it('should throw UnauthorizedException if OTP is invalid', async () => {
      const userWithOtp = { ...mockUser, isEmailVerified: false, otpHash: 'hashedOtp', otpExpiry: new Date(Date.now() + 900000) };
      userRepository.findOne.mockResolvedValue(userWithOtp as User);
      otpService.isOtpExpired.mockReturnValue(false);
      otpService.verifyOtp.mockResolvedValue(false);

      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.verifyOtp(verifyDto)).rejects.toThrow('Invalid OTP');
    });
  });

  describe('resendOtp', () => {
    const resendDto = {
      email: 'test@example.com',
    };

    it('should successfully resend OTP', async () => {
      const unverifiedUser = { ...mockUser, isEmailVerified: false };
      userRepository.findOne.mockResolvedValue(unverifiedUser as User);
      otpService.generateOtp.mockReturnValue('654321');
      otpService.hashOtp.mockResolvedValue('newHashedOtp');
      otpService.getOtpExpiry.mockReturnValue(new Date(Date.now() + 900000));
      userRepository.save.mockResolvedValue(unverifiedUser as User);
      mailService.sendOtpEmail.mockResolvedValue(undefined);

      const result = await authService.resendOtp(resendDto);

      expect(result.message).toBe('New OTP sent to your email.');
      expect(otpService.generateOtp).toHaveBeenCalled();
      expect(otpService.hashOtp).toHaveBeenCalledWith('654321');
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith(resendDto.email, '654321', expect.any(String));
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(authService.resendOtp(resendDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if email already verified', async () => {
      const verifiedUser = { ...mockUser, isEmailVerified: true };
      userRepository.findOne.mockResolvedValue(verifiedUser as User);

      await expect(authService.resendOtp(resendDto)).rejects.toThrow(BadRequestException);
      await expect(authService.resendOtp(resendDto)).rejects.toThrow('Email already verified');
    });
  });

  describe('forgotPassword', () => {
    it('should request password reset for existing user', async () => {
      const existingUser = { ...mockUser, isEmailVerified: true } as User;
      userRepository.findOne.mockResolvedValue(existingUser);
      passwordResetRepository.create.mockReturnValue({} as PasswordReset);
      passwordResetRepository.save.mockResolvedValue({} as PasswordReset);
      mailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await authService.forgotPassword('test@example.com', Role.MERCHANT);

      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com', role: Role.MERCHANT } });
      expect(passwordResetRepository.create).toHaveBeenCalled();
      expect(passwordResetRepository.save).toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com', 'mock-uuid-1234', 'test');
    });

    it('should always return success even if user not found (security)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await authService.forgotPassword('nonexistent@example.com', Role.MERCHANT);

      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');
      expect(passwordResetRepository.create).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should return success if user has invalid role', async () => {
      const userWithInvalidRole = { ...mockUser, role: null as unknown as Role } as User;
      userRepository.findOne.mockResolvedValue(userWithInvalidRole);

      const result = await authService.forgotPassword('test@example.com', Role.MERCHANT);

      expect(result.message).toBe('If an account exists with this email, a password reset link has been sent.');
    });
  });

  describe('resetPassword', () => {
    const createMockQueryBuilder = (tokens: Partial<PasswordReset>[]) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(tokens),
    });

    beforeEach(() => {
      // Reset the mock for createQueryBuilder
      (passwordResetRepository.createQueryBuilder as jest.Mock) = jest.fn();
    });

    it('should reset password with valid token', async () => {
      const validToken: Partial<PasswordReset> = {
        id: 'reset-token-id',
        userId: 'test-uuid',
        tokenHash: 'hashedToken',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        usedAt: null,
        user: mockUser as User,
      };

      (passwordResetRepository.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([validToken]));
      userRepository.save.mockResolvedValue(mockUser as User);
      passwordResetRepository.save.mockResolvedValue({ ...validToken, usedAt: new Date() } as PasswordReset);
      tokenService.revokeAllUserTokens.mockResolvedValue(1);

      // Mock bcrypt.compare to return true for the token
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.resetPassword('valid-token', 'NewSecurePass123');

      expect(result.message).toBe('Password has been reset successfully. Please log in with your new password.');
      expect(passwordResetRepository.createQueryBuilder).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('test-uuid');
    });

    it('should reject expired token', async () => {
      const expiredToken: Partial<PasswordReset> = {
        id: 'reset-token-id',
        userId: 'test-uuid',
        tokenHash: 'hashedToken',
        expiresAt: new Date(Date.now() - 1000), // expired
        usedAt: null,
        user: mockUser as User,
      };

      (passwordResetRepository.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([expiredToken]));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(authService.resetPassword('expired-token', 'NewSecurePass123')).rejects.toThrow(BadRequestException);
      await expect(authService.resetPassword('expired-token', 'NewSecurePass123')).rejects.toThrow('Invalid or expired reset token');
    });

    it('should reject used token', async () => {
      // Token is considered used because it's not returned by the query (usedAt IS NULL filter)
      (passwordResetRepository.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([]));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(authService.resetPassword('used-token', 'NewSecurePass123')).rejects.toThrow(BadRequestException);
      await expect(authService.resetPassword('used-token', 'NewSecurePass123')).rejects.toThrow('Invalid or expired reset token');
    });

    it('should reject invalid token', async () => {
      (passwordResetRepository.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([]));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.resetPassword('invalid-token', 'NewSecurePass123')).rejects.toThrow(BadRequestException);
      await expect(authService.resetPassword('invalid-token', 'NewSecurePass123')).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('changePassword', () => {
    it('should change password with valid current password', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      userRepository.save.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      const result = await authService.changePassword(
        'test-uuid',
        'CurrentPass123',
        'NewSecurePass123',
        Role.MERCHANT,
      );

      expect(result.message).toBe('Password changed successfully.');
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should reject wrong current password', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword('test-uuid', 'WrongPassword', 'NewSecurePass123', Role.MERCHANT),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.changePassword('test-uuid', 'WrongPassword', 'NewSecurePass123', Role.MERCHANT),
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        authService.changePassword('non-existent-id', 'CurrentPass123', 'NewSecurePass123', Role.MERCHANT),
      ).rejects.toThrow(NotFoundException);
      await expect(
        authService.changePassword('non-existent-id', 'CurrentPass123', 'NewSecurePass123', Role.MERCHANT),
      ).rejects.toThrow('User not found');
    });

    it('should throw BadRequestException if role is invalid', async () => {
      await expect(
        authService.changePassword('test-uuid', 'CurrentPass123', 'NewSecurePass123', null as unknown as Role),
      ).rejects.toThrow(BadRequestException);
      await expect(
        authService.changePassword('test-uuid', 'CurrentPass123', 'NewSecurePass123', null as unknown as Role),
      ).rejects.toThrow('Invalid user role');
    });
  });
});
