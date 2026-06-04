import { Injectable, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { BusinessType } from '../common/enums/business-type.enum';
import { EntityStatus } from '../common/enums/entity-status.enum';
import { PaginationService, PaginatedResult } from '../common/pagination';

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    private readonly paginationService: PaginationService,
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
   * Update merchant details.
   * If the currency changes, cascade the update to all wallets under this merchant
   * (merchant wallet + all staff wallets).
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
    const currencyChanged = updates.currency !== undefined && updates.currency !== merchant.currency;

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

    // Save merchant within a transaction so wallet cascade is atomic
    await this.merchantRepository.manager.transaction(async (entityManager) => {
      await entityManager.save(merchant);

      // If currency changed, cascade to all wallets under this merchant
      if (currencyChanged && updates.currency) {
        // Update the merchant's own wallet
        await entityManager.query(
          'UPDATE "wallets" SET "currency" = $1 WHERE "owner_id" = $2 AND "owner_type" = $3',
          [updates.currency, id, 'merchant'],
        );

        // Update all staff wallets for this merchant's staff profiles
        await entityManager.query(
          'UPDATE "wallets" SET "currency" = $1 WHERE "owner_id" IN ' +
          '(SELECT "id" FROM "staff_profiles" WHERE "merchant_id" = $2) ' +
          'AND "owner_type" = $3',
          [updates.currency, id, 'staff'],
        );

        this.logger.log(
          `Currency cascade: updated wallets for merchant ${id} to ${updates.currency}`,
        );
      }
    });

    return merchant;
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
      .then((r: { count: string }) => parseInt(r.count, 10));

    // Query wallet balance for this merchant
    const walletResult: { balance: string }[] = await this.merchantRepository.manager.query(
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

  /**
   * GET /merchant/:merchantId/staff
   * List staff profiles belonging to this merchant, with optional search
   * and pagination. Only the merchant owner can access this.
   *
   * Search is case-insensitive and matches against firstName, lastName,
   * email, and employeeCode.  Results are ordered by createdAt DESC.
   */
  async getMerchantStaff(
    merchantId: string,
    search?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<{
    id: string;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    displayName: string | null;
    roleTag: string | null;
    employeeCode: string | null;
    isActive: boolean;
    isClockedIn: boolean;
    createdAt: Date;
  }>> {
    const qb = this.staffProfileRepository
      .createQueryBuilder('sp')
      .leftJoinAndSelect('sp.user', 'u')
      .where('sp.merchantId = :merchantId', { merchantId });

    // Apply search filter (case-insensitive, partial match)
    if (search) {
      qb.andWhere(
        '(LOWER(u.firstName) LIKE :search OR ' +
        'LOWER(u.lastName) LIKE :search OR ' +
        'LOWER(u.email) LIKE :search OR ' +
        'LOWER(sp.employeeCode) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    qb.orderBy('sp.createdAt', 'DESC');

    const skip = this.paginationService.getSkip(page, limit);
    const [profiles, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const items = profiles.map((profile) => ({
      id: profile.id,
      userId: profile.userId,
      firstName: profile.user?.firstName ?? null,
      lastName: profile.user?.lastName ?? null,
      email: profile.user?.email ?? '',
      phone: profile.user?.phone ?? null,
      displayName: profile.displayName,
      roleTag: profile.roleTag,
      employeeCode: profile.employeeCode ?? null,
      isActive: profile.status === EntityStatus.ACTIVE,
      isClockedIn: profile.isClockedIn,
      createdAt: profile.createdAt,
    }));

    return this.paginationService.wrap(items, total, page, limit);
  }
}