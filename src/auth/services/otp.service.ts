import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

@Injectable()
export class OtpService {
  private readonly otpLength = 6;
  private readonly saltRounds = 10;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate a random 6-digit OTP
   * Uses crypto.randomInt for cryptographically secure random generation
   * Digits are in range 0-7
   */
  generateOtp(): string {
    let otp = '';
    for (let i = 0; i < this.otpLength; i++) {
      otp += randomInt(0, 8).toString();
    }
    return otp;
  }

  /**
   * Hash an OTP for storage
   */
  async hashOtp(otp: string): Promise<string> {
    return bcrypt.hash(otp, this.saltRounds);
  }

  /**
   * Verify an OTP against a stored hash
   */
  async verifyOtp(otp: string, hashedOtp: string): Promise<boolean> {
    return bcrypt.compare(otp, hashedOtp);
  }

  /**
   * Calculate OTP expiry time
   */
  getOtpExpiry(): Date {
    const configValue = this.configService.get<string>('OTP_EXPIRY_MINUTES', '15');
    const expiryMinutes = Number(configValue);
    const minutes = isNaN(expiryMinutes) || expiryMinutes <= 0 ? 15 : expiryMinutes;
    
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + minutes);
    return expiryTime;
  }

  /**
   * Check if OTP has expired
   */
  isOtpExpired(expiryTime: Date | null): boolean {
    if (!expiryTime) return true;
    return new Date() > expiryTime;
  }
}
