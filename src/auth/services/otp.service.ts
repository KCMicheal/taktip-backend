import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  private readonly otpLength = 6;
  private readonly saltRounds = 10;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate a random 6-digit OTP
   */
  generateOtp(): string {
    let otp = '';
    for (let i = 0; i < this.otpLength; i++) {
      otp += Math.floor(Math.random() * 10).toString();
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
    const expiryMinutes = this.configService.get<number>('OTP_EXPIRY_MINUTES', 15);
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
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
