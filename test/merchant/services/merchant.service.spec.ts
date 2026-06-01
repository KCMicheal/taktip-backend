import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MerchantService } from '../../../src/merchant/merchant.service';
import { Merchant } from '../../../src/merchant/entities/merchant.entity';
import { StaffProfile } from '../../../src/staff/entities/staff-profile.entity';
import { BusinessType } from '../../../src/common/enums/business-type.enum';
import { PaginationService } from '../../../src/common/pagination/pagination.service';

describe('MerchantService', () => {
  let service: MerchantService;
  let merchantRepository: jest.Mocked<Repository<Merchant>>;
  let staffProfileRepository: jest.Mocked<Repository<StaffProfile>>;
  let paginationService: PaginationService;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-uuid',
    name: 'Test Restaurant',
    shortCode: 'CODE123456-TR',
    businessType: BusinessType.RESTAURANT,
    address: '123 Test St',
    email: 'test@restaurant.com',
    phone: '+2341234567890',
    city: 'Lagos',
    state: 'Lagos',
    zip: '100001',
    country: 'NG',
    description: 'A test restaurant',
    logoUrl: 'https://example.com/logo.png',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    ownerId: 'owner-uuid',
  };

  const mockSummaryQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count: '3' }),
  };

  const mockManager = {
    createQueryBuilder: jest.fn(() => mockSummaryQueryBuilder),
    query: jest.fn().mockResolvedValue([]),
  };

  /**
   * Build a fresh mock query builder for staff profile queries.
   * Each test can override getManyAndCount as needed.
   */
  function createStaffQbMock() {
    return {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantService,
        PaginationService,
        {
          provide: getRepositoryToken(Merchant),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            manager: mockManager,
          },
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MerchantService>(MerchantService);
    paginationService = module.get<PaginationService>(PaginationService);
    merchantRepository = module.get(getRepositoryToken(Merchant));
    staffProfileRepository = module.get(getRepositoryToken(StaffProfile));

    jest.clearAllMocks();
  });

  describe('getMerchantSummary', () => {
    it('should return staffCount and zero placeholders for wallet/tips/subscriptions', async () => {
      merchantRepository.findOne.mockResolvedValue(mockMerchant as Merchant);

      const result = await service.getMerchantSummary('merchant-uuid');

      expect(result.staffCount).toBe(3);
      expect(result.walletBalance).toBe(0);
      expect(result.pendingTips).toBe(0);
      expect(result.activeSubscriptions).toBe(0);
      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockManager.query).toHaveBeenCalledWith(
        'SELECT balance FROM wallets WHERE "merchantId" = $1 LIMIT 1',
        ['merchant-uuid'],
      );
    });

    it('should throw NotFoundException if merchant not found', async () => {
      merchantRepository.findOne.mockResolvedValue(null);

      await expect(service.getMerchantSummary('invalid-uuid')).rejects.toThrow(NotFoundException);
      await expect(service.getMerchantSummary('invalid-uuid')).rejects.toThrow('Merchant not found');
    });
  });

  describe('getMerchantStaff', () => {
    const mockProfiles = [
      {
        id: 'profile-1',
        userId: 'user-1',
        merchantId: 'merchant-uuid',
        displayName: 'Alice',
        roleTag: 'Waiter',
        employeeCode: 'EMP-001',
        isClockedIn: true,
        status: 1, // EntityStatus.ACTIVE
        createdAt: new Date('2026-01-01'),
        user: {
          id: 'user-1',
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@example.com',
          phone: '+234700000001',
        },
      },
      {
        id: 'profile-2',
        userId: 'user-2',
        merchantId: 'merchant-uuid',
        displayName: 'Bob',
        roleTag: 'Chef',
        employeeCode: null,
        isClockedIn: false,
        status: 2, // EntityStatus.INACTIVE
        createdAt: new Date('2026-02-01'),
        user: {
          id: 'user-2',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
          phone: null,
        },
      },
    ];

    const createOrphanProfile = () => ({
      id: 'profile-orphan',
      userId: 'user-orphan',
      merchantId: 'merchant-uuid',
      displayName: null,
      roleTag: null,
      employeeCode: null,
      status: 1,
      isClockedIn: false,
      createdAt: new Date(),
      user: null,
    });

    it('should return paginated staff profiles with user info', async () => {
      const qbMock = createStaffQbMock();
      qbMock.getManyAndCount.mockResolvedValue([mockProfiles, 2]);
      (staffProfileRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const result = await service.getMerchantStaff('merchant-uuid', undefined, 1, 20);

      // Check query builder chain
      expect(staffProfileRepository.createQueryBuilder).toHaveBeenCalledWith('sp');
      expect(qbMock.leftJoinAndSelect).toHaveBeenCalledWith('sp.user', 'u');
      expect(qbMock.where).toHaveBeenCalledWith('sp.merchantId = :merchantId', { merchantId: 'merchant-uuid' });
      expect(qbMock.andWhere).not.toHaveBeenCalled(); // no search
      expect(qbMock.orderBy).toHaveBeenCalledWith('sp.createdAt', 'DESC');
      expect(qbMock.skip).toHaveBeenCalledWith(0);
      expect(qbMock.take).toHaveBeenCalledWith(20);

      // Check paginated wrapper
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);

      // First staff member
      expect(result.items[0].id).toBe('profile-1');
      expect(result.items[0].firstName).toBe('Alice');
      expect(result.items[0].lastName).toBe('Smith');
      expect(result.items[0].email).toBe('alice@example.com');
      expect(result.items[0].phone).toBe('+234700000001');
      expect(result.items[0].displayName).toBe('Alice');
      expect(result.items[0].roleTag).toBe('Waiter');
      expect(result.items[0].employeeCode).toBe('EMP-001');
      expect(result.items[0].isActive).toBe(true);
      expect(result.items[0].isClockedIn).toBe(true);

      // Second staff member
      expect(result.items[1].id).toBe('profile-2');
      expect(result.items[1].firstName).toBe('Bob');
      expect(result.items[1].email).toBe('bob@example.com');
      expect(result.items[1].phone).toBeNull();
      expect(result.items[1].roleTag).toBe('Chef');
      expect(result.items[1].employeeCode).toBeNull();
      expect(result.items[1].isActive).toBe(false);
      expect(result.items[1].isClockedIn).toBe(false);
    });

    it('should support search filter', async () => {
      const qbMock = createStaffQbMock();
      qbMock.getManyAndCount.mockResolvedValue([[mockProfiles[0]], 1]);
      (staffProfileRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const result = await service.getMerchantStaff('merchant-uuid', 'alice', 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(u.firstName) LIKE'),
        { search: '%alice%' },
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty items when no staff', async () => {
      const qbMock = createStaffQbMock();
      qbMock.getManyAndCount.mockResolvedValue([[], 0]);
      (staffProfileRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const result = await service.getMerchantStaff('merchant-uuid');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle staff without user relation gracefully', async () => {
      const qbMock = createStaffQbMock();
      qbMock.getManyAndCount.mockResolvedValue([[createOrphanProfile()], 1]);
      (staffProfileRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const result = await service.getMerchantStaff('merchant-uuid');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].firstName).toBeNull();
      expect(result.items[0].email).toBe(''); // fallback to empty string
      expect(result.items[0].displayName).toBeNull();
      expect(result.items[0].isClockedIn).toBe(false);
    });
  });
});
