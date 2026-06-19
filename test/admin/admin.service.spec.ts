import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../../src/admin/admin.service';
import { User } from '../../src/auth/entities/user.entity';
import { Role } from '../../src/auth/enums/role.enum';
import { Merchant } from '../../src/merchant/entities/merchant.entity';
import { Payout } from '../../src/payouts/entities/payout.entity';
import { PaginationService } from '../../src/common/pagination/pagination.service';

describe('AdminService', () => {
  let service: AdminService;
  let userRepository: jest.Mocked<Repository<User>>;
  let merchantRepository: jest.Mocked<Repository<Merchant>>;
  let payoutRepository: jest.Mocked<Repository<Payout>>;

  const mockManager = {
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const createQueryBuilderMock = () => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        PaginationService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: {
            count: jest.fn(),
            manager: mockManager,
          },
        },
        {
          provide: getRepositoryToken(Payout),
          useValue: {
            count: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    userRepository = module.get(getRepositoryToken(User));
    merchantRepository = module.get(getRepositoryToken(Merchant));
    payoutRepository = module.get(getRepositoryToken(Payout));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  //  Dashboard Stats
  // ---------------------------------------------------------------------------

  describe('getDashboardStats', () => {
    it('should return aggregated platform KPIs', async () => {
      merchantRepository.count.mockResolvedValue(42);
      userRepository.count.mockResolvedValue(1250);
      payoutRepository.count.mockResolvedValue(12);

      // Mock tips today aggregate
      mockManager.query
        .mockResolvedValueOnce([{ count: '156', volume: '340000' }]) // tips today
        .mockResolvedValueOnce([{ total: '2500000' }]); // wallet balance

      // Mock users by role aggregation
      const roleQbMock = createQueryBuilderMock();
      roleQbMock.getRawMany.mockResolvedValue([
        { role: Role.CUSTOMER.toString(), count: '800' },
        { role: Role.MERCHANT.toString(), count: '100' },
        { role: Role.STAFF.toString(), count: '300' },
        { role: Role.ADMIN.toString(), count: '5' },
      ]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(roleQbMock);

      const result = await service.getDashboardStats();

      expect(result).toEqual({
        totalMerchants: 42,
        totalUsers: 1250,
        customersCount: 800,
        merchantsCount: 100,
        staffCount: 300,
        adminsCount: 5,
        tipsToday: 156,
        tipsTodayVolume: 340000,
        pendingPayouts: 12,
        totalWalletBalance: 2500000,
      });
    });

    it('should default to zero counts when no data exists', async () => {
      merchantRepository.count.mockResolvedValue(0);
      userRepository.count.mockResolvedValue(0);
      payoutRepository.count.mockResolvedValue(0);

      mockManager.query
        .mockResolvedValueOnce([{ count: '0', volume: '0' }])
        .mockResolvedValueOnce([{ total: '0' }]);

      const roleQbMock = createQueryBuilderMock();
      roleQbMock.getRawMany.mockResolvedValue([]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(roleQbMock);

      const result = await service.getDashboardStats();

      expect(result.totalMerchants).toBe(0);
      expect(result.totalUsers).toBe(0);
      expect(result.customersCount).toBe(0);
      expect(result.merchantsCount).toBe(0);
      expect(result.staffCount).toBe(0);
      expect(result.adminsCount).toBe(0);
      expect(result.tipsToday).toBe(0);
      expect(result.tipsTodayVolume).toBe(0);
      expect(result.pendingPayouts).toBe(0);
      expect(result.totalWalletBalance).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  //  User Management
  // ---------------------------------------------------------------------------

  describe('findAllUsers', () => {
    it('should return paginated users with safe fields only', async () => {
      const qbMock = createQueryBuilderMock();
      const users = [
        { id: 'user-1', email: 'user1@example.com', role: Role.MERCHANT },
        { id: 'user-2', email: 'user2@example.com', role: Role.STAFF },
      ];
      qbMock.getManyAndCount.mockResolvedValue([users, 2]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const result = await service.findAllUsers({}, 1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      // Should select only safe fields, excluding passwordHash, otpHash, otpExpiry
      expect(qbMock.select).toHaveBeenCalledWith([
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
      expect(qbMock.andWhere).not.toHaveBeenCalled();
    });

    it('should filter by role when provided', async () => {
      const qbMock = createQueryBuilderMock();
      qbMock.getManyAndCount.mockResolvedValue([[], 0]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      await service.findAllUsers({ role: Role.ADMIN }, 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith('u.role = :role', { role: 4 });
    });

    it('should search by email or name', async () => {
      const qbMock = createQueryBuilderMock();
      qbMock.getManyAndCount.mockResolvedValue([[], 0]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      await service.findAllUsers({ search: 'john' }, 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(u.email) LIKE'),
        { search: '%john%' },
      );
    });

    it('should filter by date range', async () => {
      const qbMock = createQueryBuilderMock();
      qbMock.getManyAndCount.mockResolvedValue([[], 0]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-06-01');

      await service.findAllUsers({ dateFrom, dateTo }, 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith('u.createdAt >= :dateFrom', { dateFrom });
      expect(qbMock.andWhere).toHaveBeenCalledWith('u.createdAt <= :dateTo', { dateTo });
    });

    it('should not apply role filter when role is undefined', async () => {
      const qbMock = createQueryBuilderMock();
      qbMock.getManyAndCount.mockResolvedValue([[], 0]);
      (userRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      await service.findAllUsers({}, 1, 20);

      // andWhere should not be called with role filter
      const calls = (qbMock.andWhere).mock.calls.filter(
        (call: unknown[]) => (call[0] as string).includes('u.role'),
      );
      expect(calls).toHaveLength(0);
    });
  });

  describe('deactivateUser', () => {
    it('should set isActive to false when deactivating', async () => {
      const mockUser = { id: 'user-uuid', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue({ ...mockUser, isActive: false });

      const result = await service.deactivateUser('user-uuid', true);

      expect(result.isActive).toBe(false);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deactivateUser('nonexistent', true),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
