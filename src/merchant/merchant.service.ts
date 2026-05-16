import { Injectable, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { BusinessType } from '../common/enums/business-type.enum';

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
  ) {}

  /**
   * Generate a short code for a merchant
   * Uses business name initials, fallback to random if no valid initials
   * Format: CODE123456-XX (6 random + 2 initials)
   * 
   * @param businessName - The name of the business
   * @returns Generated short code
   */
  generateShortCode(businessName: string): string {
    if (!businessName || businessName.trim().length === 0) {
      // Fallback to random if no business name
      return this.generateRandomCode('XX');
    }

    // Get initials from business name (first letter of each word)
    const words = businessName.trim().split(/\s+/);
    const initials = words
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2)
      .padEnd(2, 'X'); // Default to 'XX' if no valid initials

    // Generate random alphanumeric part (6 chars)
    return this.generateRandomCode(initials);
  }

  /**
   * Generate random alphanumeric part for short code
   */
  private generateRandomCode(initials: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `CODE${randomPart}-${initials}`;
  }

  /**
   * Generate a guaranteed unique short code
   * Checks database for existing codes and regenerates if collision
   * 
   * @param businessName - The name of the business
   * @returns Unique short code
   */
  async generateUniqueShortCode(businessName: string): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const shortCode = this.generateShortCode(businessName);

      // Check if already exists in database
      const existing = await this.merchantRepository.findOne({
        where: { shortCode },
      });

      if (!existing) {
        return shortCode;
      }

      this.logger.warn(`ShortCode collision attempt ${attempt}: ${shortCode}`);
    }

    throw new ConflictException('Unable to generate unique short code. Please try again.');
  }

  /**
   * Create a new merchant
   * 
   * @param ownerId - The user ID of the owner
   * @param name - Business name
   * @param businessType - Optional business type enum
   * @param address - Optional address
   * @returns Created merchant
   */
  async createMerchant(
    ownerId: string,
    name: string,
    businessType?: BusinessType,
    address?: string,
  ): Promise<Merchant> {
    // Generate unique short code
    const shortCode = await this.generateUniqueShortCode(name);

    const merchant = this.merchantRepository.create({
      name,
      shortCode,
      businessType: businessType ?? null,
      address: address ?? null,
      ownerId,
    });

    return this.merchantRepository.save(merchant);
  }

  /**
   * Get merchant by ID
   */
  async getMerchantById(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({
      where: { id },
      relations: ['owner'],
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return merchant;
  }

  /**
   * Get merchant by short code
   */
  async getMerchantByShortCode(shortCode: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({
      where: { shortCode },
      relations: ['owner'],
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found with this code');
    }

    return merchant;
  }

  /**
   * Get all merchants for an owner
   */
  async getMerchantsByOwnerId(ownerId: string): Promise<Merchant[]> {
    return this.merchantRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Update merchant details
   */
  async updateMerchant(
    id: string,
    updates: {
      name?: string;
      businessType?: BusinessType;
      address?: string;
      email?: string;
      phone?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      description?: string;
      logoUrl?: string;
      currency?: string;
      timezone?: string;
    },
  ): Promise<Merchant> {
    const merchant = await this.getMerchantById(id);

    // Apply updates
    if (updates.name !== undefined) merchant.name = updates.name;
    if (updates.businessType !== undefined) merchant.businessType = updates.businessType;
    if (updates.address !== undefined) merchant.address = updates.address;
    if (updates.email !== undefined) merchant.email = updates.email;
    if (updates.phone !== undefined) merchant.phone = updates.phone;
    if (updates.city !== undefined) merchant.city = updates.city;
    if (updates.state !== undefined) merchant.state = updates.state;
    if (updates.zip !== undefined) merchant.zip = updates.zip;
    if (updates.country !== undefined) merchant.country = updates.country;
    if (updates.description !== undefined) merchant.description = updates.description;
    if (updates.logoUrl !== undefined) merchant.logoUrl = updates.logoUrl;
    if (updates.currency !== undefined) merchant.currency = updates.currency;
    if (updates.timezone !== undefined) merchant.timezone = updates.timezone;

    return this.merchantRepository.save(merchant);
  }

  /**
   * Get merchant summary for settings/account deletion page
   *
   * Stage 1: staffCount is real; walletBalance, pendingTips, activeSubscriptions
   * are placeholders (zero) until Wallet/Tipping/Subscription modules are built.
   */
  async getMerchantSummary(merchantId: string): Promise<{
    staffCount: number;
    walletBalance: number;
    pendingTips: number;
    activeSubscriptions: number;
  }> {
    // Verify merchant exists
    await this.getMerchantById(merchantId);

    // Count staff profiles for this merchant
    const staffCount = await this.merchantRepository.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('staff_profiles', 'sp')
      .where('sp."merchantId" = :merchantId', { merchantId })
      .getRawOne()
      .then(r => parseInt(r.count, 10));

    // Query wallet balance for this merchant
    const walletResult = await this.merchantRepository.manager.query(
      'SELECT balance FROM wallets WHERE "merchantId" = $1 LIMIT 1',
      [merchantId],
    );
    const walletBalance =
      walletResult.length > 0 ? parseFloat(walletResult[0].balance) : 0;

    return {
      staffCount,
      walletBalance,
      pendingTips: 0,   // TODO: Phase C — Tipping module
      activeSubscriptions: 0, // TODO: Subscription module
    };
  }
}