import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CustomerProfile } from './entities/customer-profile.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
      smsEnabled?: boolean;
      monthlyReports?: boolean;
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

  /**
   * Get all payment methods for the customer.
   * Returns bank name and account number (similar to staff payout method).
   */
  async getPaymentMethods(
    userId: string,
  ): Promise<Array<{ id: string; type: string; bankName: string; accountNumber: string }>> {
    const profile = await this.getByUserId(userId);

    const methods = profile.paymentMethods ?? [];
    return methods.map((m) => {
      const details = (m.details ?? {}) as Record<string, unknown>;
      return {
        id: String(m.id ?? ''),
        type: String(m.type ?? ''),
        bankName: String(details.bankName ?? 'Unknown Bank'),
        accountNumber: String(details.accountNumber ?? ''),
      };
    });
  }
}
