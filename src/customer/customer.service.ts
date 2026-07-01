import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { CustomerProfile } from './entities/customer-profile.entity';
import { User } from '../auth/entities/user.entity';
import { OtpService } from '../auth/services/otp.service';
import { MailService } from '../auth/services/mail.service';
import { TwoFactorService } from '../auth/services/two-factor.service';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  /**
   * Find a customer profile by user ID.
   */
  async findByUserId(userId: string): Promise<CustomerProfile | null> {
    return this.customerProfileRepository.findOne({
      where: { userId },
    });
  }

  /**
   * Find a customer profile by user ID, or throw if not found.
   * Includes the user relation for display purposes.
   */
  async getByUserId(userId: string): Promise<CustomerProfile> {
    const profile = await this.customerProfileRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException('Customer profile not found. Please register as a customer first.');
    }
    return profile;
  }

  /**
   * Ensure a customer profile exists for this user.
   * Creates one if it doesn't exist (idempotent).
   * Optionally sets the avatar at creation time.
   */
  async getOrCreateProfile(userId: string, avatar?: string): Promise<CustomerProfile> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const profile = this.customerProfileRepository.create({
      userId,
      ...(avatar ? { avatar } : {}),
    });
    const saved = await this.customerProfileRepository.save(profile);
    this.logger.log(`Customer profile created for user ${userId} (id: ${saved.id})`);
    return saved;
  }

  /**
   * Update a customer profile's displayName and/or avatar.
   * Only updates fields that are provided.
   */
  async updateProfile(
    userId: string,
    data: { displayName?: string; avatar?: string },
  ): Promise<CustomerProfile> {
    const profile = await this.getByUserId(userId);

    if (data.displayName !== undefined) {
      profile.displayName = data.displayName;
    }
    if (data.avatar !== undefined) {
      profile.avatar = data.avatar;
    }

    await this.customerProfileRepository.save(profile);

    // Reload with user relation for response
    return this.getByUserId(userId);
  }

  // ─────────────────────────────────────────────────────────────
  //  Notification Preferences
  // ─────────────────────────────────────────────────────────────

  /**
   * Update notification preferences for the authenticated customer.
   * Merges the provided fields into the existing JSONB object.
   */
  async updateNotificationPreferences(
    userId: string,
    prefs: {
      pushEnabled?: boolean;
      emailNotifications?: boolean;
      tipReceived?: boolean;
      tipWithdrawn?: boolean;
      marketingEmails?: boolean;
      [key: string]: unknown;
    },
  ): Promise<Record<string, unknown>> {
    const profile = await this.getByUserId(userId);

    const current = profile.notificationPreferences ?? {};
    const updated = { ...current, ...prefs };

    // Remove undefined keys (not provided by client) to keep JSONB clean
    for (const key of Object.keys(updated)) {
      if (updated[key] === undefined) {
        delete updated[key];
      }
    }

    profile.notificationPreferences = updated;
    await this.customerProfileRepository.save(profile);

    this.logger.log(`Notification preferences updated for user ${userId}`);
    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  //  General Preferences
  // ─────────────────────────────────────────────────────────────

  /**
   * Update customer preferences (language, currency, timezone).
   * Merges the provided fields into the existing JSONB object.
   */
  async updatePreferences(
    userId: string,
    prefs: {
      language?: string;
      currency?: string;
      timezone?: string;
      [key: string]: unknown;
    },
  ): Promise<Record<string, unknown>> {
    const profile = await this.getByUserId(userId);

    const current = profile.preferences ?? {};
    const updated = { ...current, ...prefs };

    // Remove undefined keys
    for (const key of Object.keys(updated)) {
      if (updated[key] === undefined) {
        delete updated[key];
      }
    }

    profile.preferences = updated;
    await this.customerProfileRepository.save(profile);

    this.logger.log(`Preferences updated for user ${userId}`);
    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  //  Payment Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Add a new payment method to the customer's saved methods.
   */
  async addPaymentMethod(
    userId: string,
    data: {
      type: 'card' | 'bank';
      details: Record<string, unknown>;
      label?: string;
    },
  ): Promise<{ id: string; type: string; label: string }> {
    const profile = await this.getByUserId(userId);

    const methods = profile.paymentMethods ?? [];
    const newMethod = {
      id: randomUUID(),
      type: data.type,
      label: data.label ?? `${data.type === 'bank' ? 'Bank Account' : 'Card'}`,
      details: data.details,
      createdAt: new Date().toISOString(),
    };

    methods.push(newMethod);
    profile.paymentMethods = methods;
    await this.customerProfileRepository.save(profile);

    this.logger.log(`Payment method added for user ${userId}: ${newMethod.id}`);
    return { id: newMethod.id, type: newMethod.type, label: newMethod.label };
  }

  /**
   * Delete a payment method by its ID.
   */
  async deletePaymentMethod(userId: string, methodId: string): Promise<void> {
    const profile = await this.getByUserId(userId);

    const methods = profile.paymentMethods ?? [];
    const index = methods.findIndex((m) => m.id === methodId);

    if (index === -1) {
      throw new NotFoundException('Payment method not found');
    }

    methods.splice(index, 1);
    profile.paymentMethods = methods;
    await this.customerProfileRepository.save(profile);

    this.logger.log(`Payment method deleted for user ${userId}: ${methodId}`);
  }

  // ─────────────────────────────────────────────────────────────
  //  2FA (Two-Factor Authentication) with TOTP
  // ─────────────────────────────────────────────────────────────

  /**
   * Generate a TOTP setup secret + QR code + backup codes.
   * The secret is saved provisionally — 2FA is NOT enabled until
   * confirm2FASetup() is called with a valid TOTP code.
   */
  async setup2FA(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isTwoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }

    return this.twoFactorService.generateSetupSecret(userId, user.email);
  }

  /**
   * Confirm and enable 2FA.
   * Verifies current password + TOTP code before enabling.
   * Sends a confirmation email.
   */
  async enable2FA(
    userId: string,
    password: string,
    token: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isTwoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Verify TOTP code against the provisionally saved secret
    if (!user.twoFactorSecret) {
      throw new BadRequestException(
        'Please generate a 2FA setup code first using POST /customer/auth/2fa/setup',
      );
    }

    const isValid = this.twoFactorService.verifyTOTP(token, user.twoFactorSecret);
    if (!isValid) {
      throw new UnauthorizedException('Invalid two-factor authentication code');
    }

    user.isTwoFactorEnabled = true;
    await this.userRepository.save(user);

    // Send confirmation email
    try {
      await this.mailService.sendOtpEmail(
        user.email,
        'Two-factor authentication has been enabled on your TakTip account.',
        user.email.split('@')[0],
      );
    } catch {
      this.logger.warn(`Failed to send 2FA confirmation email to ${user.email}`);
    }

    this.logger.log(`2FA enabled for user ${userId}`);
    return { message: 'Two-factor authentication has been enabled successfully.' };
  }

  /**
   * Disable 2FA for the customer.
   * Verifies current password + TOTP code before disabling.
   */
  async disable2FA(
    userId: string,
    password: string,
    token?: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isTwoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate TOTP or backup code before disabling
    await this.twoFactorService.validateTwoFactorCode(user, token);

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.backupCodes = null;
    await this.userRepository.save(user);

    this.logger.log(`2FA disabled for user ${userId}`);
    return { message: 'Two-factor authentication has been disabled successfully.' };
  }
}
