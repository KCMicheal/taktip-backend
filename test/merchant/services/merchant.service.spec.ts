import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MerchantService } from '../../../src/merchant/merchant.service';
import { Merchant } from '../../../src/merchant/entities/merchant.entity';
import { StaffProfile } from '../../../src/staff/entities/staff-profile.entity';
import { BusinessType } from '../../../src/common/enums/business-type.enum';

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

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count: '3' }),
  };

  const mockManager = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantService,
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
    it('should return staff profiles with user info', async () => {
      merchantRepository.findOne.mockResolvedValue(mockMerchant as Merchant);

      const mockProfiles = [
        {
          id: 'profile-1',
          userId: 'user-1',
          merchantId: 'merchant-uuid',
          displayName: 'Alice',
          roleTag: 'Waiter',
          isClockedIn: true,
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
          isClockedIn: false,
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

      staffProfileRepository.find.mockResolvedValue(mockProfiles as unknown as StaffProfile[]);

      const result = await service.getMerchantStaff('merchant-uuid');

      expect(result).toHaveLength(2);
      expect(staffProfileRepository.find).toHaveBeenCalledWith({
        where: { merchantId: 'merchant-uuid' },
        relations: ['user'],
        order: { createdAt: 'DESC' },
      });

      // First staff member
      expect(result[0].id).toBe('profile-1');
      expect(result[0].firstName).toBe('Alice');
      expect(result[0].lastName).toBe('Smith');
      expect(result[0].email).toBe('alice@example.com');
      expect(result[0].phone).toBe('+234700000001');
      expect(result[0].displayName).toBe('Alice');
      expect(result[0].roleTag).toBe('Waiter');
      expect(result[0].isClockedIn).toBe(true);

      // Second staff member
      expect(result[1].id).toBe('profile-2');
      expect(result[1].firstName).toBe('Bob');
      expect(result[1].email).toBe('bob@example.com');
      expect(result[1].phone).toBeNull();
      expect(result[1].roleTag).toBe('Chef');
      expect(result[1].isClockedIn).toBe(false);
    });

    it('should return empty array when no staff', async () => {
      merchantRepository.findOne.mockResolvedValue(mockMerchant as Merchant);
      staffProfileRepository.find.mockResolvedValue([]);

      const result = await service.getMerchantStaff('merchant-uuid');

      expect(result).toEqual([]);
    });

    it('should handle staff without user relation gracefully', async () => {
      merchantRepository.findOne.mockResolvedValue(mockMerchant as Merchant);

      const profileWithoutUser = {
        id: 'profile-orphan',
        userId: 'user-orphan',
        merchantId: 'merchant-uuid',
        displayName: null,
        roleTag: null,
        isClockedIn: false,
        createdAt: new Date(),
        user: null,
      };

      staffProfileRepository.find.mockResolvedValue([profileWithoutUser] as unknown as StaffProfile[]);

      const result = await service.getMerchantStaff('merchant-uuid');

      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBeNull();
      expect(result[0].email).toBe(''); // fallback to empty string
      expect(result[0].displayName).toBeNull();
      expect(result[0].isClockedIn).toBe(false);
    });
  });
});
