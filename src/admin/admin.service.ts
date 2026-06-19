import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/enums/role.enum';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { PayoutStatus } from '../payouts/enums/payout-status.enum';
import { PaginationService, PaginatedResult } from '../common/pagination';

/**
 * Dashboard statistics response.
 */
export interface DashboardStats {
  totalMerchants: number;
  totalUsers: number;
  customersCount: number;
  merchantsCount: number;
  staffCount: number;
  adminsCount: number;
  tipsToday: number;
  tipsTodayVolume: number;
  pendingPayouts: number;
  totalWalletBalance: number;
}

/**
 * Admin service — provides cross-module aggregate queries and user management
 * for the admin console.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    private readonly paginationService: PaginationService,
  ) {}

  // ---------------------------------------------------------------------------
  //  Dashboard Stats
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/dashboard/stats
   * Returns platform-wide KPIs.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const [totalMerchants, totalUsers, tipsTodayResult, pendingPayouts, walletResult] =
      await Promise.all([
        this.merchantRepository.count(),
        this.userRepository.count(),
        this.getTipsTodayAggregate(),
        this.payoutRepository.count({ where: { payoutStatus: PayoutStatus.PENDING } }),
        this.getTotalWalletBalance(),
      ]);

    // Count users by role
    const usersByRole: { role: string; count: string }[] = await this.userRepository
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.role')
      .getRawMany();

    const roleCounts: Record<number, number> = {};
    for (const row of usersByRole) {
      roleCounts[Number(row.role)] = parseInt(row.count, 10);
    }

    return {
      totalMerchants,
      totalUsers,
      customersCount: roleCounts[Role.CUSTOMER] ?? 0,
      merchantsCount: roleCounts[Role.MERCHANT] ?? 0,
      staffCount: roleCounts[Role.STAFF] ?? 0,
      adminsCount: roleCounts[Role.ADMIN] ?? 0,
      tipsToday: tipsTodayResult.count,
      tipsTodayVolume: tipsTodayResult.volume,
      pendingPayouts,
      totalWalletBalance: walletResult,
    };
  }

  /**
   * Aggregate tips created today (volume and count).
   */
  private async getTipsTodayAggregate(): Promise<{ count: number; volume: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: { count: string; volume: string }[] =
      await this.merchantRepository.manager.query(
        `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS volume
         FROM "tips"
         WHERE "createdAt" >= $1`,
        [today.toISOString()],
      );

    return {
      count: parseInt(result[0]?.count ?? '0', 10),
      volume: parseFloat(result[0]?.volume ?? '0'),
    };
  }

  /**
   * Sum of all wallet balances across the platform.
   */
  private async getTotalWalletBalance(): Promise<number> {
    const result: { total: string }[] =
      await this.merchantRepository.manager.query(
        `SELECT COALESCE(SUM(balance_available), 0)::text AS total FROM "wallets"`,
      );

    return parseFloat(result[0]?.total ?? '0');
  }

  // ---------------------------------------------------------------------------
  //  User Management
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/users
   * Paginated user list with optional role filter and search.
   */
  async findAllUsers(
    filters: {
      role?: Role;
      search?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<Partial<User>>> {
    const qb = this.userRepository.createQueryBuilder('u');

    // Select only safe fields — exclude sensitive data (passwordHash, otpHash, otpExpiry)
    qb.select([
      'u.id',
      'u.email',
      'u.firstName',
      'u.lastName',
      'u.phone',
      'u.role',
      'u.isEmailVerified',
      'u.isActive',
      'u.createdAt',
      'u.updatedAt',
    ]);

    if (filters.role !== undefined && typeof filters.role === 'number') {
      qb.andWhere('u.role = :role', { role: filters.role });
    }

    if (filters.search) {
      qb.andWhere(
        '(LOWER(u.email) LIKE :search OR LOWER(u.firstName) LIKE :search OR LOWER(u.lastName) LIKE :search)',
        { search: `%${filters.search.toLowerCase()}%` },
      );
    }

    if (filters.dateFrom) {
      qb.andWhere('u.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('u.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('u.createdAt', 'DESC');

    const skip = this.paginationService.getSkip(page, limit);
    const [items, total] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return this.paginationService.wrap(items, total, page, limit);
  }

  /**
   * PATCH /admin/users/:id/deactivate
   * Deactivate a user account by toggling isActive.
   */
  async deactivateUser(userId: string, deactivate: boolean): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isActive = !deactivate;
    return this.userRepository.save(user);
  }
}
