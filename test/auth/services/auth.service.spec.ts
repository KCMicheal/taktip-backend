/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '@/auth/services/auth.service';
import { OtpService } from '@/auth/services/otp.service';
import { MailService } from '@/auth/services/mail.service';
import { TokenService } from '@/auth/services/token.service';
import { User } from '@/auth/entities/user.entity';
import { Role } from '@/auth/enums/role.enum';

jest.mock('bcrypt');
jest.mock('jose');

describe('AuthService', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<Repository<User>>;
  let otpService: jest.Mocked<OtpService>;
  let mailService: jest.Mocked<MailService>;

  const mockUser: Partial<User> = {
    id: 'test-uuid',
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
    otpService = module.get(OtpService);
    mailService = module.get(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerMerchant', () => {
    const registerDto = {
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
});
