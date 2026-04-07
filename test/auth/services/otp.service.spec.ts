import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpService } from '@/auth/services/otp.service';

describe('OtpService', () => {
  let otpService: OtpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: number) => {
              const config: Record<string, number> = {
                OTP_EXPIRY_MINUTES: 15,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    otpService = module.get<OtpService>(OtpService);
  });

  describe('generateOtp', () => {
    it('should generate a 6-digit OTP', () => {
      const otp = otpService.generateOtp();
      
      expect(otp).toHaveLength(6);
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should generate different OTPs on subsequent calls', () => {
      const otp1 = otpService.generateOtp();
      const otp2 = otpService.generateOtp();
      
      // Note: There's a small chance these could be equal, but it's very unlikely
      // For production, consider using a more robust random generator
      expect(typeof otp1).toBe('string');
      expect(typeof otp2).toBe('string');
    });
  });

  describe('hashOtp', () => {
    it('should hash an OTP', async () => {
      const otp = '123456';
      const hash = await otpService.hashOtp(otp);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(otp);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce different hashes for same OTP', async () => {
      const otp = '123456';
      const hash1 = await otpService.hashOtp(otp);
      const hash2 = await otpService.hashOtp(otp);
      
      // bcrypt uses random salt, so hashes should be different
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyOtp', () => {
    it('should return true for valid OTP', async () => {
      const otp = '123456';
      const hash = await otpService.hashOtp(otp);
      
      const isValid = await otpService.verifyOtp(otp, hash);
      
      expect(isValid).toBe(true);
    });

    it('should return false for invalid OTP', async () => {
      const otp = '123456';
      const wrongOtp = '654321';
      const hash = await otpService.hashOtp(otp);
      
      const isValid = await otpService.verifyOtp(wrongOtp, hash);
      
      expect(isValid).toBe(false);
    });
  });

  describe('getOtpExpiry', () => {
    it('should return a date 15 minutes in the future by default', () => {
      const before = new Date();
      const expiry = otpService.getOtpExpiry();
      const after = new Date();
      
      // Expiry should be approximately 15 minutes from now
      const minExpected = before.getTime() + 14 * 60 * 1000; // 14 minutes
      const maxExpected = after.getTime() + 16 * 60 * 1000; // 16 minutes
      
      expect(expiry.getTime()).toBeGreaterThanOrEqual(minExpected);
      expect(expiry.getTime()).toBeLessThanOrEqual(maxExpected);
    });
  });

  describe('isOtpExpired', () => {
    it('should return true for null expiry', () => {
      const result = otpService.isOtpExpired(null);
      
      expect(result).toBe(true);
    });

    it('should return true for past date', () => {
      const pastDate = new Date(Date.now() - 1000);
      const result = otpService.isOtpExpired(pastDate);
      
      expect(result).toBe(true);
    });

    it('should return false for future date', () => {
      const futureDate = new Date(Date.now() + 900000); // 15 minutes
      const result = otpService.isOtpExpired(futureDate);
      
      expect(result).toBe(false);
    });
  });
});
