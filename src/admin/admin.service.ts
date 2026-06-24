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
 * Daily time-series data point.
 */
export interface DailyBreakdown {
  date: string;
  count: number;
  volume?: number;
}

/**
 * Analytics response for a given date range.
 */
export interface AnalyticsResponse {
  period: { dateFrom: string; dateTo: string };
  tips: {
    total: number;
    volume: number;
    dailyBreakdown: DailyBreakdown[];
  };
  merchants: {
    newCount: number;
    dailyBreakdown: DailyBreakdown[];
  };
  payouts: {
    total: number;
    volume: number;
    dailyBreakdown: DailyBreakdown[];
  };
  users: {
    newCount: number;
    byRole: { role: number; roleName: string; count: number }[];
    dailyBreakdown: DailyBreakdown[];
  };
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
  //  Analytics
  // ---------------------------------------------------------------------------

  /**
   * GET /admin/analytics
   * Aggregate platform metrics over a date range: tips, merchants, payouts, users.
   */
  async getAnalytics(filters: {
    dateFrom: Date;
    dateTo: Date;
  }): Promise<AnalyticsResponse> {
    const { dateFrom, dateTo } = filters;

    const [
      tipsData,
      tipsDaily,
      merchantsDaily,
      payoutsData,
      payoutsDaily,
      usersDaily,
      usersByRole,
    ] = await Promise.all([
      // Tips — total count + volume
      this.rawAggregate('tips', dateFrom, dateTo),
      // Tips — daily breakdown
      this.rawDailyBreakdown('tips', dateFrom, dateTo, ['COUNT(*)', 'COALESCE(SUM(amount),0)']),
      // Merchants — daily breakdown
      this.rawDailyBreakdown('merchants', dateFrom, dateTo, ['COUNT(*)']),
      // Payouts — total count + volume
      this.rawAggregate('payouts', dateFrom, dateTo),
      // Payouts — daily breakdown
      this.rawDailyBreakdown('payouts', dateFrom, dateTo, ['COUNT(*)', 'COALESCE(SUM(amount),0)']),
      // Users — daily breakdown
      this.rawDailyBreakdown('users', dateFrom, dateTo, ['COUNT(*)']),
      // Users — by role
      this.userRepository
        .createQueryBuilder('u')
        .select('u.role', 'role')
        .addSelect('COUNT(*)', 'count')
        .where('u.createdAt >= :dateFrom', { dateFrom })
        .andWhere('u.createdAt <= :dateTo', { dateTo })
        .groupBy('u.role')
        .orderBy('u.role')
        .getRawMany(),
    ]);

    const roleNames: Record<number, string> = {
      1: 'CUSTOMER',
      2: 'MERCHANT',
      3: 'STAFF',
      4: 'ADMIN',
    };

    return {
      period: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() },
      tips: {
        total: tipsData.count,
        volume: tipsData.volume,
        dailyBreakdown: tipsDaily,
      },
      merchants: {
        newCount: merchantsDaily.reduce((sum, d) => sum + d.count, 0),
        dailyBreakdown: merchantsDaily,
      },
      payouts: {
        total: payoutsData.count,
        volume: payoutsData.volume,
        dailyBreakdown: payoutsDaily,
      },
      users: {
        newCount: usersDaily.reduce((sum, d) => sum + d.count, 0),
        byRole: (usersByRole as { role: string; count: string }[]).map((r) => ({
          role: Number(r.role),
          roleName: roleNames[Number(r.role)] ?? 'UNKNOWN',
          count: parseInt(r.count, 10),
        })),
        dailyBreakdown: usersDaily,
      },
    };
  }

  /**
   * Run a simple COUNT / SUM aggregate for a table over a date range.
   */
  private async rawAggregate(
    table: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<{ count: number; volume: number }> {
    const result: { count: string; volume: string }[] =
      await this.merchantRepository.manager.query(
        `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS volume
         FROM "${table}"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
        [dateFrom.toISOString(), dateTo.toISOString()],
      );
    return {
      count: parseInt(result[0]?.count ?? '0', 10),
      volume: parseFloat(result[0]?.volume ?? '0'),
    };
  }

  /**
   * Run a daily-grouped breakdown query for a table over a date range.
   * `aggregates` are SQL expressions like ['COUNT(*)', 'COALESCE(SUM(amount),0)'].
   */
  private async rawDailyBreakdown(
    table: string,
    dateFrom: Date,
    dateTo: Date,
    aggregates: string[],
  ): Promise<DailyBreakdown[]> {
    const selectExprs = aggregates.map((agg, i) => `${agg} AS val_${i}`);
    const result: { day: string; val_0: string; val_1?: string }[] =
      await this.merchantRepository.manager.query(
        `SELECT DATE("createdAt") AS day, ${selectExprs.join(', ')}
         FROM "${table}"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY day
         ORDER BY day ASC`,
        [dateFrom.toISOString(), dateTo.toISOString()],
      );

    return result.map((row) => {
      const entry: DailyBreakdown = { date: row.day, count: parseInt(row.val_0 ?? '0', 10) };
      if (row.val_1 !== undefined) {
        entry.volume = parseFloat(row.val_1 ?? '0');
      }
      return entry;
    });
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
