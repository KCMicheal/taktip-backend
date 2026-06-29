import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Tip } from './entities/tip.entity';
import { TipSource } from './enums/tip-source.enum';
import { TipResponseDto } from './dto/tip-response.dto';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { PaginatedResult } from '../common/pagination';

@Injectable()
export class TipsService {
  private readonly logger = new Logger(TipsService.name);

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
  ) {}

  /**
   * Record a new tip.
   */
  async recordTip(data: {
    transactionId?: string;
    merchantId: string;
    staffProfileId: string;
    customerProfileId?: string;
    amount: number;
    currency?: string;
    message?: string;
    rating?: number;
    source: TipSource;
    qrCodeId?: string;
  }): Promise<Tip> {
    const tip = this.tipRepository.create({
      transactionId: data.transactionId || null,
      merchantId: data.merchantId,
      staffProfileId: data.staffProfileId,
      customerProfileId: data.customerProfileId || null,
      amount: data.amount,
      currency: data.currency || 'NGN',
      message: data.message || null,
      rating: data.rating ?? null,
      source: data.source,
      qrCodeId: data.qrCodeId || null,
    } as Partial<Tip>);

    const saved = await this.tipRepository.save(tip);

    this.logger.log(
      `Tip of ${data.amount} ${data.currency || 'NGN'} recorded ` +
        `for staff ${data.staffProfileId} at merchant ${data.merchantId}`,
    );

    return saved;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the sender display name for a tip.
   *
   * - Guest tip (customerProfileId is null): 'Guest'
   * - Staff tip (source !== C2C): customerProfile → displayName
   * - C2C tip: senderId → CustomerProfile → displayName
   * - Fallback: 'Unknown'
   */
  private resolveSenderName(
    tip: Tip,
    customerProfileMap: Map<string, CustomerProfile>,
  ): string {
    if (tip.source === TipSource.CUSTOMER_TO_CUSTOMER) {
      if (tip.senderId) {
        const profile = customerProfileMap.get(tip.senderId);
        if (profile) return profile.displayName || `${profile.user?.firstName || ''}`.trim() || 'Unknown';
      }
      return 'Unknown';
    }

    // Staff / guest tip
    if (!tip.customerProfileId) {
      return 'Guest';
    }
    const profile = customerProfileMap.get(tip.customerProfileId);
    if (profile) return profile.displayName || `${profile.user?.firstName || ''}`.trim() || 'Unknown';
    return 'Unknown';
  }

  /**
   * Resolve the recipient display name for a tip.
   *
   * - C2C tip (recipientType === 'customer'): staffProfileId → CustomerProfile → displayName
   * - Staff tip: staffProfileId → StaffProfile → displayName
   * - Fallback: 'Unknown'
   */
  private resolveRecipientName(
    tip: Tip,
    customerProfileMap: Map<string, CustomerProfile>,
    staffProfileMap: Map<string, StaffProfile>,
  ): string {
    if (tip.recipientType === 'customer') {
      const profile = customerProfileMap.get(tip.staffProfileId);
      if (profile) return profile.displayName || `${profile.user?.firstName || ''}`.trim() || 'Unknown';
      return 'Unknown';
    }

    const profile = staffProfileMap.get(tip.staffProfileId);
    if (profile) return profile.displayName || `${profile.user?.firstName || ''}`.trim() || 'Unknown Staff';
    return 'Unknown';
  }

  /**
   * Fetch CustomerProfiles (with User) for a set of IDs and return a map.
   */
  private async buildCustomerProfileMap(
    ids: Set<string>,
  ): Promise<Map<string, CustomerProfile>> {
    if (ids.size === 0) return new Map();
    const profiles = await this.customerProfileRepository.find({
      where: { id: In([...ids]) },
      relations: ['user'],
    });
    return new Map(profiles.map((p) => [p.id, p]));
  }

  /**
   * Fetch StaffProfiles (with User) for a set of IDs and return a map.
   */
  private async buildStaffProfileMap(
    ids: Set<string>,
  ): Promise<Map<string, StaffProfile>> {
    if (ids.size === 0) return new Map();
    const profiles = await this.staffProfileRepository.find({
      where: { id: In([...ids]) },
      relations: ['user'],
    });
    return new Map(profiles.map((p) => [p.id, p]));
  }

  /**
   * Map a Tip + lookup maps into a TipResponseDto.
   */
  private tipToDto(
    tip: Tip,
    customerProfileMap: Map<string, CustomerProfile>,
    staffProfileMap: Map<string, StaffProfile>,
    merchantNameMap: Map<string, string>,
  ): TipResponseDto {
    return {
      id: tip.id,
      amount: Number(tip.amount),
      currency: tip.currency,
      message: tip.message || undefined,
      rating: tip.rating ?? undefined,
      createdAt: tip.createdAt,
      senderName: this.resolveSenderName(tip, customerProfileMap),
      recipientName: this.resolveRecipientName(tip, customerProfileMap, staffProfileMap),
      merchantName: merchantNameMap.get(tip.merchantId) || undefined,
      merchantId: tip.merchantId || undefined,
      staffProfileId: tip.staffProfileId || undefined,
      customerProfileId: tip.customerProfileId || undefined,
      qrCodeId: tip.qrCodeId || undefined,
      source: tip.source,
      tipStatus: tip.tipStatus,
      recipientType: tip.recipientType || undefined,
    };
  }

  // ── Public query methods ─────────────────────────────────────────────────

  /**
   * Find tips for a specific staff member with pagination.
   * Returns enriched TipResponseDto items.
   */
  async findByStaff(
    staffProfileId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<TipResponseDto>> {
    const skip = (page - 1) * limit;

    const [tips, total] = await this.tipRepository.findAndCount({
      where: { staffProfileId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Build lookup maps
    const customerProfileIds = new Set<string>();
    for (const t of tips) {
      if (t.customerProfileId) customerProfileIds.add(t.customerProfileId);
      if (t.source === TipSource.CUSTOMER_TO_CUSTOMER && t.senderId) {
        customerProfileIds.add(t.senderId);
      }
    }

    const [customerProfileMap, staffProfileMap, merchantNameMap] = await Promise.all([
      this.buildCustomerProfileMap(customerProfileIds),
      this.buildStaffProfileMap(new Set([staffProfileId])),
      this.fetchMerchantNameMap(tips),
    ]);

    const items = tips.map((t) =>
      this.tipToDto(t, customerProfileMap, staffProfileMap, merchantNameMap),
    );

    return { items, total, page, limit };
  }

  /**
   * Find tips for a merchant with pagination, including sender/recipient names.
   */
  async findByMerchant(
    merchantId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<TipResponseDto>> {
    const skip = (page - 1) * limit;

    const [tips, total] = await this.tipRepository.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Build lookup maps
    const customerProfileIds = new Set<string>();
    const staffProfileIds = new Set<string>();
    for (const t of tips) {
      if (t.customerProfileId) customerProfileIds.add(t.customerProfileId);
      if (t.source === TipSource.CUSTOMER_TO_CUSTOMER && t.senderId) {
        customerProfileIds.add(t.senderId);
      }
      if (t.staffProfileId) staffProfileIds.add(t.staffProfileId);
    }

    const [customerProfileMap, staffProfileMap, merchantNameMap] = await Promise.all([
      this.buildCustomerProfileMap(customerProfileIds),
      this.buildStaffProfileMap(staffProfileIds),
      this.fetchMerchantNameMap(tips),
    ]);

    const items = tips.map((t) =>
      this.tipToDto(t, customerProfileMap, staffProfileMap, merchantNameMap),
    );

    return { items, total, page, limit };
  }

  /**
   * Build a merchantId → merchant.name lookup map for a set of tips.
   */
  private async fetchMerchantNameMap(
    tips: Tip[],
  ): Promise<Map<string, string>> {
    const merchantIds = [...new Set(tips.map((t) => t.merchantId).filter(Boolean))];
    if (merchantIds.length === 0) return new Map();

    const merchants = await this.merchantRepository.find({
      where: { id: In(merchantIds) },
    });
    return new Map(merchants.map((m) => [m.id, m.name]));
  }

  /**
   * Get aggregated earnings for a staff member within an optional date range.
   */
  async getStaffEarnings(
    staffProfileId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalAmount: number;
    tipCount: number;
    averageTip: number;
    periodStart: string | null;
    periodEnd: string | null;
  }> {
    // Default to today if no date range provided
    if (!startDate && !endDate) {
      const now = new Date();
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      endDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
    }

    const where: Record<string, unknown> = {
      staffProfileId,
    };

    if (startDate && endDate) {
      where.createdAt = Between(startDate, endDate);
    } else if (startDate) {
      where.createdAt = Between(startDate, new Date());
    } else if (endDate) {
      where.createdAt = Between(new Date('1970-01-01'), endDate);
    }

    const tips = await this.tipRepository.find({
      where,
    });

    const totalAmount = tips.reduce(
      (sum, tip) => sum + Number(tip.amount),
      0,
    );

    const tipCount = tips.length;
    const averageTip =
      tipCount > 0 ? Math.round((totalAmount / tipCount) * 100) / 100 : 0;

    return {
      totalAmount,
      tipCount,
      averageTip,
      periodStart: startDate ? startDate.toISOString() : null,
      periodEnd: endDate ? endDate.toISOString() : null,
    };
  }

  /**
   * Get aggregated tips for a merchant within a date range.
   */
  async getMerchantTipsAggregation(
    merchantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ totalAmount: number; tipCount: number }> {
    const result: { totalAmount: string; tipCount: string } | undefined = await this.tipRepository
      .createQueryBuilder('tip')
      .select('COALESCE(SUM(tip.amount), 0)', 'totalAmount')
      .addSelect('COUNT(tip.id)', 'tipCount')
      .where('tip.merchantId = :merchantId', { merchantId })
      .andWhere('tip.createdAt >= :startDate', { startDate })
      .andWhere('tip.createdAt <= :endDate', { endDate })
      .getRawOne();

    return {
      totalAmount: parseFloat(result?.totalAmount ?? '0') || 0,
      tipCount: parseInt(result?.tipCount ?? '0', 10) || 0,
    };
  }

  /**
   * Get top N staff by total tips received for a merchant.
   */
  async getTopStaffByMerchant(
    merchantId: string,
    limit: number = 5,
  ): Promise<Array<{ staffProfileId: string; displayName: string; totalAmount: number; tipCount: number }>> {
    interface AggregationRow {
      staffProfileId: string;
      totalAmount: string;
      tipCount: string;
    }

    const results: AggregationRow[] = await this.tipRepository
      .createQueryBuilder('tip')
      .select('tip.staffProfileId', 'staffProfileId')
      .addSelect('COALESCE(SUM(tip.amount), 0)', 'totalAmount')
      .addSelect('COUNT(tip.id)', 'tipCount')
      .where('tip.merchantId = :merchantId', { merchantId })
      .groupBy('tip.staffProfileId')
      .orderBy('"totalAmount"', 'DESC')
      .limit(limit)
      .getRawMany();

    // Enrich with staff display names
    const staffProfileIds = results.map((r) => r.staffProfileId);
    const staffProfiles = staffProfileIds.length > 0
      ? await this.staffProfileRepository.findBy({ id: In(staffProfileIds) })
      : [];

    const nameMap = new Map<string, string>();
    for (const profile of staffProfiles) {
      nameMap.set(profile.id, profile.displayName || 'Unknown Staff');
    }

    return results.map((r) => ({
      staffProfileId: r.staffProfileId,
      displayName: nameMap.get(r.staffProfileId) || 'Unknown Staff',
      totalAmount: parseFloat(r.totalAmount) || 0,
      tipCount: parseInt(r.tipCount, 10) || 0,
    }));
  }
}
