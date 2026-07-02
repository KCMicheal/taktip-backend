import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { generateSecret, verifySync, generateURI } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a TOTP secret and QR code for authenticator app setup.
   * Saves the secret provisionally to the user record (2FA still disabled
   * until the user confirms with a valid TOTP code).
   *
   * @returns secret (base32, for manual entry), qrCode (data URL), and plain backup codes
   */
  async generateSetupSecret(
    userId: string,
    userEmail: string,
  ): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    // Generate TOTP secret
    const secret = generateSecret();

    // Generate QR code URI
    const appName = this.configService.get<string>('APP_NAME', 'TakTip');
    const uri = generateURI({
      issuer: appName,
      label: userEmail,
      secret,
    });

    // Generate QR code as data URL
    const qrCode = await QRCode.toDataURL(uri);

    // Generate 10 backup codes (8-character alphanumeric)
    const plainBackupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      plainBackupCodes.push(code);
      // Store SHA-256 hash for verification
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      hashedBackupCodes.push(hash);
    }

    // Save secret and hashed backup codes (user must verify with TOTP before 2FA is enabled)
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user) {
      user.twoFactorSecret = secret;
      user.backupCodes = hashedBackupCodes;
      await this.userRepository.save(user);
    }

    this.logger.log(`2FA setup secret generated for user ${userId}`);

    return { secret, qrCode, backupCodes: plainBackupCodes };
  }

  /**
   * Verify a TOTP code against a secret.
   * By default allows ±30 seconds drift (1 time-step on either side).
   */
  verifyTOTP(token: string, secret: string): boolean {
    try {
      // otplib v13 sync API — returns { valid: boolean }
      const result = verifySync({ token, secret });
      return result.valid;
    } catch (error) {
      this.logger.warn(`TOTP verification failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Verify a backup code for the user.
   * If valid, the backup code is consumed (removed).
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.backupCodes || user.backupCodes.length === 0) {
      return false;
    }

    const codes = [...user.backupCodes];
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === codeHash) {
        // Consume the backup code
        codes.splice(i, 1);
        user.backupCodes = codes;
        await this.userRepository.save(user);
        return true;
      }
    }

    return false;
  }

  /**
   * Validate a TOTP code or backup code for the user.
   * Used during login and disable flows.
   *
   * @throws UnauthorizedException if neither TOTP nor backup code is valid
   */
  async validateTwoFactorCode(
    user: User,
    token?: string,
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException({
        message: 'Two-factor authentication code is required',
        requiresTwoFactor: true,
      });
    }

    // Try TOTP verification first
    if (user.twoFactorSecret) {
      const isValid = this.verifyTOTP(token, user.twoFactorSecret);
      if (isValid) return;
    }

    // Fall back to backup code
    const isBackupValid = await this.verifyBackupCode(user.id, token);
    if (isBackupValid) return;

    throw new UnauthorizedException('Invalid two-factor authentication code');
  }
}
