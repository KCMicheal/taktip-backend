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
    if (updates.description !== undefined) merchant.description = updates.description;
    if (updates.logoUrl !== undefined) merchant.logoUrl = updates.logoUrl;
    if (updates.currency !== undefined) merchant.currency = updates.currency;
    if (updates.timezone !== undefined) merchant.timezone = updates.timezone;

    return this.merchantRepository.save(merchant);
  }
}