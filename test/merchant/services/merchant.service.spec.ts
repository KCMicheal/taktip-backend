import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MerchantService } from '../../../src/merchant/merchant.service';
import { Merchant } from '../../../src/merchant/entities/merchant.entity';
import { StaffProfile } from '../../../src/staff/entities/staff-profile.entity';
import { BusinessType } from '../../../src/common/enums/business-type.enum';
import { EntityStatus } from '../../../src/common/enums/entity-status.enum';
import { KycStatus } from '../../../src/merchant/enums/kyc-status.enum';
import { PaginationService } from '../../../src/common/pagination/pagination.service';

describe('MerchantService', () => {
  let service: MerchantService;
  let merchantRepository: jest.Mocked<Repository<Merchant>>;
  let staffProfileRepository: jest.Mocked<Repository<StaffProfile>>;

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
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
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
        'SELECT balance_available AS balance FROM wallets WHERE "owner_id" = $1 AND "owner_type" = $2 LIMIT 1',
        ['merchant-uuid', 'merchant'],
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
      expect(qbMock.where).toHaveBeenCalledWith('sp."merchantId" = :merchantId', { merchantId: 'merchant-uuid' });
      expect(qbMock.andWhere).toHaveBeenCalledWith('sp.status = :activeStatus', { activeStatus: 1 });
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

  // ---------------------------------------------------------------------------
  //  Admin-facing methods
  // ---------------------------------------------------------------------------

  describe('findAllAdmin', () => {
    const createMerchantQbMock = () => ({
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    });

    it('should return paginated merchants with safe owner fields only', async () => {
      const qbMock = createMerchantQbMock();
      const merchants = [
        { id: 'merchant-1', name: 'Restaurant A', owner: { email: 'owner@example.com' } },
        { id: 'merchant-2', name: 'Restaurant B', owner: { email: 'owner2@example.com' } },
      ];
      qbMock.getManyAndCount.mockResolvedValue([merchants, 2]);
      (merchantRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      const result = await service.findAllAdmin({}, 1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      // Should use leftJoin (NOT leftJoinAndSelect) and only select safe owner fields
      expect(qbMock.leftJoin).toHaveBeenCalledWith('m.owner', 'u');
      expect(qbMock.addSelect).toHaveBeenCalledWith(
        ['u.id', 'u.email', 'u.firstName', 'u.lastName'],
      );
    });

    it('should filter by status when provided', async () => {
      const qbMock = createMerchantQbMock();
      (merchantRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      await service.findAllAdmin({ status: EntityStatus.ACTIVE }, 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith('m.status = :status', { status: 1 });
    });

    it('should filter by kycStatus when provided', async () => {
      const qbMock = createMerchantQbMock();
      (merchantRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      await service.findAllAdmin({ kycStatus: KycStatus.PENDING }, 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith('m.kycStatus = :kycStatus', { kycStatus: 1 });
    });

    it('should search by name or owner email', async () => {
      const qbMock = createMerchantQbMock();
      (merchantRepository.createQueryBuilder as jest.Mock).mockReturnValue(qbMock);

      await service.findAllAdmin({ search: 'test' }, 1, 20);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(m.name) LIKE'),
        { search: '%test%' },
      );
    });
  });

  describe('approveMerchant', () => {
    it('should set kycStatus to APPROVED and record admin info', async () => {
      const merchant = { id: 'merchant-uuid', kycStatus: KycStatus.PENDING } as Merchant;
      merchantRepository.findOne.mockResolvedValue(merchant);
      merchantRepository.save.mockImplementation((m: unknown) => Promise.resolve(m as Merchant));

      const result = await service.approveMerchant('merchant-uuid', 'admin-uuid');

      expect(result.kycStatus).toBe(KycStatus.APPROVED);
      expect(result.status).toBe(EntityStatus.ACTIVE);
      expect(result.approvedBy).toBe('admin-uuid');
      expect(result.approvedAt).toBeInstanceOf(Date);
    });

    it('should throw BadRequestException if already approved', async () => {
      const merchant = { id: 'merchant-uuid', kycStatus: KycStatus.APPROVED } as Merchant;
      merchantRepository.findOne.mockResolvedValue(merchant);

      await expect(
        service.approveMerchant('merchant-uuid', 'admin-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if merchant does not exist', async () => {
      merchantRepository.findOne.mockResolvedValue(null);

      await expect(
        service.approveMerchant('nonexistent', 'admin-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspendMerchant', () => {
    it('should set status to SUSPENDED', async () => {
      const merchant = { id: 'merchant-uuid', status: EntityStatus.ACTIVE } as Merchant;
      merchantRepository.findOne.mockResolvedValue(merchant);
      merchantRepository.save.mockImplementation((m: unknown) => Promise.resolve(m as Merchant));

      const result = await service.suspendMerchant('merchant-uuid');

      expect(result.status).toBe(EntityStatus.SUSPENDED);
    });

    it('should throw BadRequestException if already suspended', async () => {
      const merchant = { id: 'merchant-uuid', status: EntityStatus.SUSPENDED } as Merchant;
      merchantRepository.findOne.mockResolvedValue(merchant);

      await expect(
        service.suspendMerchant('merchant-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if merchant does not exist', async () => {
      merchantRepository.findOne.mockResolvedValue(null);

      await expect(
        service.suspendMerchant('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // removeStaff
  // ---------------------------------------------------------------------------
  describe('removeStaff', () => {
    const merchantId = 'merchant-uuid';
    const staffId = 'staff-uuid';

    const mockProfile = {
      id: staffId,
      merchantId,
      isClockedIn: false,
      currentShiftId: null,
      status: EntityStatus.ACTIVE,
      userId: 'user-uuid',
    } as StaffProfile;

    const mockEntityManager = {
      query: jest.fn(),
      update: jest.fn(),
    };

    beforeEach(() => {
      // StaffProfile mock only provides find/createQueryBuilder by default.
      // Add findOne + manager for the removeStaff code-path.
      staffProfileRepository.findOne = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (staffProfileRepository as any).manager = {
        transaction: jest.fn().mockImplementation(
          async (cb: (em: typeof mockEntityManager) => Promise<void>) => {
            await cb(mockEntityManager);
          },
        ),
      };
    });

    it('should throw NotFoundException if staff profile not found', async () => {
      staffProfileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.removeStaff(merchantId, staffId),
      ).rejects.toThrow(NotFoundException);

      expect(staffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { id: staffId, merchantId },
      });
    });

    it('should throw NotFoundException if staff profile is already deleted', async () => {
      staffProfileRepository.findOne.mockResolvedValue({
        ...mockProfile,
        status: EntityStatus.DELETED,
      });

      await expect(
        service.removeStaff(merchantId, staffId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if staff is clocked in', async () => {
      staffProfileRepository.findOne.mockResolvedValue({
        ...mockProfile,
        isClockedIn: true,
        currentShiftId: 'active-shift-uuid',
      });

      await expect(
        service.removeStaff(merchantId, staffId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.removeStaff(merchantId, staffId),
      ).rejects.toThrow(/clocked in/i);
    });

    it('should remove future shift assignments, freeze wallet, and soft-delete profile', async () => {
      staffProfileRepository.findOne.mockResolvedValue(mockProfile);
      mockEntityManager.query.mockResolvedValue([{ balance_available: '15000' }]);

      const result = await service.removeStaff(merchantId, staffId);

      // 1. Removed future shift assignments via raw SQL
      expect(mockEntityManager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('DELETE FROM shift_staff'),
        [staffId, merchantId],
      );

      // 2. Froze wallet with INACTIVE status
      expect(mockEntityManager.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE wallets'),
        [EntityStatus.INACTIVE, expect.any(Date), staffId, 'staff'],
      );

      // 3. Soft-deleted the staff profile
      expect(mockEntityManager.update).toHaveBeenCalledWith(
        StaffProfile,
        { id: staffId },
        {
          status: EntityStatus.DELETED,
          isClockedIn: false,
          currentShiftId: null,
        },
      );

      expect(result).toEqual({ walletBalance: 15000 });
    });

    it('should return walletBalance 0 when staff has no wallet', async () => {
      staffProfileRepository.findOne.mockResolvedValue(mockProfile);
      // Wallet query returns empty — no wallet exists
      mockEntityManager.query.mockResolvedValue([]);

      const result = await service.removeStaff(merchantId, staffId);

      expect(result).toEqual({ walletBalance: 0 });
    });
  });
});
