import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Tip } from './entities/tip.entity';
import { TipSource } from './enums/tip-source.enum';
import { TipResponseDto } from './dto/tip-response.dto';
import { StaffProfile } from '../staff/entities/staff-profile.entity';

@Injectable()
export class TipsService {
  private readonly logger = new Logger(TipsService.name);

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
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

  /**
   * Find tips for a specific staff member with pagination.
   */
  async findByStaff(
    staffProfileId: string,
    page = 1,
    limit = 20,
  ): Promise<{ tips: Tip[]; total: number }> {
    const skip = (page - 1) * limit;

    const [tips, total] = await this.tipRepository.findAndCount({
      where: { staffProfileId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { tips, total };
  }

  /**
   * Find tips for a merchant with pagination, including staff display names.
   */
  async findByMerchant(
    merchantId: string,
    page = 1,
    limit = 20,
  ): Promise<{ tips: TipResponseDto[]; total: number }> {
    const skip = (page - 1) * limit;

    const [tips, total] = await this.tipRepository.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Enrich with staff display names
    const staffProfileIds = [
      ...new Set(tips.map((t) => t.staffProfileId)),
    ];

    const staffProfiles = await this.staffProfileRepository.findBy({
      id: In(staffProfileIds),
    });

    const staffNameMap = new Map<string, string>();
    for (const profile of staffProfiles) {
      staffNameMap.set(profile.id, profile.displayName || 'Unknown Staff');
    }

    const tipDtos: TipResponseDto[] = tips.map((tip) => ({
      id: tip.id,
      amount: Number(tip.amount),
      currency: tip.currency,
      message: tip.message || undefined,
      rating: tip.rating ?? undefined,
      createdAt: tip.createdAt,
      staffName: staffNameMap.get(tip.staffProfileId) || 'Unknown Staff',
      qrCodeId: tip.qrCodeId || undefined,
    }));

    return { tips: tipDtos, total };
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
}
