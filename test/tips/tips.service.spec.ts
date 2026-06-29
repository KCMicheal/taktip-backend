import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipsService } from '../../src/tips/tips.service';
import { Tip } from '../../src/tips/entities/tip.entity';
import { TipSource } from '../../src/tips/enums/tip-source.enum';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { CustomerProfile } from '../../src/customer/entities/customer-profile.entity';
import { Merchant } from '../../src/merchant/entities/merchant.entity';
import { User } from '../../src/auth/entities/user.entity';

describe('TipsService', () => {
  let service: TipsService;
  let tipRepository: Repository<Tip>;
  let staffProfileRepository: Repository<StaffProfile>;
  let customerProfileRepository: Repository<CustomerProfile>;
  let merchantRepository: Repository<Merchant>;

  const mockTipRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
  };

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    findBy: jest.fn(),
    find: jest.fn(),
  };

  const mockCustomerProfileRepository = {
    find: jest.fn(),
    findBy: jest.fn(),
    findOne: jest.fn(),
  };

  const mockMerchantRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findBy: jest.fn(),
  };

  const createMockUser = (overrides: Partial<User> = {}): User => {
    const user = new User();
    Object.assign(user, {
      id: 'user-uuid',
      email: 'staff@example.com',
      firstName: 'John',
      lastName: 'Doe',
      passwordHash: 'hash',
      role: 3,
      isEmailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return user;
  };

  const createMockTip = (overrides: Partial<Tip> = {}): Tip => {
    const tip = new Tip();
    Object.assign(tip, {
      id: 'tip-uuid',
      transactionId: null,
      merchantId: 'merchant-uuid',
      staffProfileId: 'staff-uuid',
      customerProfileId: null,
      amount: 500,
      currency: 'NGN',
      message: null,
      rating: null,
      source: TipSource.GUEST,
      tipStatus: TipStatus.COMPLETED,
      qrCodeId: null,
      senderId: null,
      senderType: null,
      recipientType: null,
      fundingSource: null,
      senderWalletId: null,
      createdAt: new Date('2024-01-01T12:00:00Z'),
      updatedAt: new Date('2024-01-01T12:00:00Z'),
      ...overrides,
    });
    return tip;
  };

  const createMockStaffProfile = (overrides: Partial<StaffProfile> = {}): StaffProfile => {
    const profile = new StaffProfile();
    Object.assign(profile, {
      id: 'staff-uuid',
      userId: 'user-uuid',
      merchantId: 'merchant-uuid',
      displayName: 'John Doe',
      user: createMockUser(),
      ...overrides,
    });
    return profile;
  };

  const createMockMerchant = (overrides: Partial<Merchant> = {}): Merchant => {
    const merchant = new Merchant();
    Object.assign(merchant, {
      id: 'merchant-uuid',
      name: 'Test Merchant',
      shortCode: 'TEST',
      ownerId: 'owner-uuid',
      ...overrides,
    });
    return merchant;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TipsService,
        {
          provide: getRepositoryToken(Tip),
          useValue: mockTipRepository,
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
        {
          provide: getRepositoryToken(CustomerProfile),
          useValue: mockCustomerProfileRepository,
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: mockMerchantRepository,
        },
      ],
    }).compile();

    service = module.get<TipsService>(TipsService);
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    staffProfileRepository = module.get<Repository<StaffProfile>>(
      getRepositoryToken(StaffProfile),
    );
    customerProfileRepository = module.get<Repository<CustomerProfile>>(
      getRepositoryToken(CustomerProfile),
    );
    merchantRepository = module.get<Repository<Merchant>>(
      getRepositoryToken(Merchant),
    );

    jest.clearAllMocks();
  });

  // ───────── recordTip ─────────

  describe('recordTip', () => {
    it('should create and save a tip with all required fields', async () => {
      const tipData = {
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-uuid',
        amount: 1000,
        source: TipSource.GUEST,
      };

      const createdTip = createMockTip({
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-uuid',
        amount: 1000,
        source: TipSource.GUEST,
      });

      mockTipRepository.create.mockReturnValue(createdTip);
      mockTipRepository.save.mockResolvedValue(createdTip);

      const result = await service.recordTip(tipData);

      expect(result.amount).toBe(1000);
      expect(result.merchantId).toBe('merchant-uuid');
      expect(result.source).toBe(TipSource.GUEST);
      expect(mockTipRepository.create).toHaveBeenCalledTimes(1);
      expect(mockTipRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should create a tip with all optional fields', async () => {
      const tipData = {
        transactionId: 'txn-uuid',
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-uuid',
        customerProfileId: 'customer-uuid',
        amount: 2000,
        currency: 'USD',
        message: 'Great service!',
        rating: 5,
        source: TipSource.WALLET,
        qrCodeId: 'qr-uuid',
      };

      const createdTip = createMockTip(tipData);
      mockTipRepository.create.mockReturnValue(createdTip);
      mockTipRepository.save.mockResolvedValue(createdTip);

      const result = await service.recordTip(tipData);

      expect(result.amount).toBe(2000);
      expect(result.currency).toBe('USD');
      expect(result.message).toBe('Great service!');
      expect(result.rating).toBe(5);
      expect(result.source).toBe(TipSource.WALLET);
      expect(result.transactionId).toBe('txn-uuid');
      expect(result.customerProfileId).toBe('customer-uuid');
      expect(result.qrCodeId).toBe('qr-uuid');
    });

    it('should use defaults for optional fields when not provided', async () => {
      const tipData = {
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-uuid',
        amount: 500,
        source: TipSource.GUEST,
      };

      const createdTip = createMockTip(tipData);
      mockTipRepository.create.mockReturnValue(createdTip);
      mockTipRepository.save.mockResolvedValue(createdTip);

      const result = await service.recordTip(tipData);

      expect(result.currency).toBe('NGN');
      expect(result.message).toBeNull();
      expect(result.rating).toBeNull();
      expect(result.transactionId).toBeNull();
      expect(result.customerProfileId).toBeNull();
      expect(result.qrCodeId).toBeNull();
    });
  });

  // ───────── findByStaff ─────────

  describe('findByStaff', () => {
    it('should return paginated tips for a staff member', async () => {
      const tips = [
        createMockTip({ id: 'tip-1', createdAt: new Date('2024-02-01') }),
        createMockTip({ id: 'tip-2', createdAt: new Date('2024-01-01') }),
      ];
      mockTipRepository.findAndCount.mockResolvedValue([tips, 2]);
      mockStaffProfileRepository.find.mockResolvedValue([createMockStaffProfile()]);
      mockCustomerProfileRepository.find.mockResolvedValue([]);
      mockMerchantRepository.find.mockResolvedValue([createMockMerchant()]);

      const result = await service.findByStaff('staff-uuid', 1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockTipRepository.findAndCount).toHaveBeenCalledWith({
        where: { staffProfileId: 'staff-uuid' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should paginate correctly', async () => {
      mockTipRepository.findAndCount.mockResolvedValue([[], 0]);
      mockStaffProfileRepository.find.mockResolvedValue([]);
      mockCustomerProfileRepository.find.mockResolvedValue([]);
      mockMerchantRepository.find.mockResolvedValue([]);

      await service.findByStaff('staff-uuid', 2, 10);

      expect(mockTipRepository.findAndCount).toHaveBeenCalledWith({
        where: { staffProfileId: 'staff-uuid' },
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 10,
      });
    });

    it('should return empty array when staff has no tips', async () => {
      mockTipRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findByStaff('staff-uuid');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should enrich guest tips with senderName "Guest"', async () => {
      const tips = [createMockTip({ id: 'tip-1' })];
      mockTipRepository.findAndCount.mockResolvedValue([tips, 1]);
      mockStaffProfileRepository.find.mockResolvedValue([createMockStaffProfile()]);
      mockCustomerProfileRepository.find.mockResolvedValue([]);
      mockMerchantRepository.find.mockResolvedValue([createMockMerchant()]);

      const result = await service.findByStaff('staff-uuid');

      expect(result.items[0].senderName).toBe('Guest');
      expect(result.items[0].recipientName).toBe('John Doe');
      expect(result.items[0].merchantName).toBe('Test Merchant');
    });
  });

  // ───────── findByMerchant ─────────

  describe('findByMerchant', () => {
    it('should return paginated tips enriched with names', async () => {
      const tips = [
        createMockTip({
          id: 'tip-1',
          staffProfileId: 'staff-1',
          amount: 500,
        }),
        createMockTip({
          id: 'tip-2',
          staffProfileId: 'staff-2',
          amount: 1000,
          message: 'Thanks!',
          rating: 4,
        }),
      ];

      const staffProfiles = [
        createMockStaffProfile({ id: 'staff-1', displayName: 'Alice' }),
        createMockStaffProfile({ id: 'staff-2', displayName: 'Bob' }),
      ];

      mockTipRepository.findAndCount.mockResolvedValue([tips, 2]);
      mockStaffProfileRepository.find.mockResolvedValue(staffProfiles);
      mockCustomerProfileRepository.find.mockResolvedValue([]);
      mockMerchantRepository.find.mockResolvedValue([createMockMerchant()]);

      const result = await service.findByMerchant('merchant-uuid', 1, 20);

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].recipientName).toBe('Alice');
      expect(result.items[0].amount).toBe(500);
      expect(result.items[1].recipientName).toBe('Bob');
      expect(result.items[1].message).toBe('Thanks!');
      expect(result.items[1].rating).toBe(4);
    });

    it('should handle staff profiles not found gracefully', async () => {
      const tips = [
        createMockTip({ id: 'tip-1', staffProfileId: 'unknown-staff' }),
      ];

      mockTipRepository.findAndCount.mockResolvedValue([tips, 1]);
      mockStaffProfileRepository.find.mockResolvedValue([]);
      mockCustomerProfileRepository.find.mockResolvedValue([]);
      mockMerchantRepository.find.mockResolvedValue([createMockMerchant()]);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result.items[0].recipientName).toBe('Unknown');
    });

    it('should return empty result for merchant with no tips', async () => {
      mockTipRepository.findAndCount.mockResolvedValue([[], 0]);
      mockStaffProfileRepository.find.mockResolvedValue([]);
      mockCustomerProfileRepository.find.mockResolvedValue([]);
      mockMerchantRepository.find.mockResolvedValue([]);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should add senderName for wallet-funded tips with customerProfileId', async () => {
      const customerUser = createMockUser({ id: 'customer-user-id', firstName: 'Jane', lastName: 'Customer' });
      const customerProfile = new CustomerProfile();
      Object.assign(customerProfile, {
        id: 'customer-uuid',
        userId: 'customer-user-id',
        displayName: null,
        user: customerUser,
      });

      const tips = [
        createMockTip({
          id: 'tip-1',
          customerProfileId: 'customer-uuid',
          source: TipSource.WALLET,
        }),
      ];

      mockTipRepository.findAndCount.mockResolvedValue([tips, 1]);
      mockStaffProfileRepository.find.mockResolvedValue([createMockStaffProfile()]);
      mockCustomerProfileRepository.find.mockResolvedValue([customerProfile]);
      mockMerchantRepository.find.mockResolvedValue([createMockMerchant()]);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result.items[0].senderName).toBe('Jane');
    });
  });

  // ───────── getStaffEarnings ─────────

  describe('getStaffEarnings', () => {
    it('should calculate total earnings for a staff member', async () => {
      const tips = [
        createMockTip({ amount: 500 }),
        createMockTip({ amount: 1000 }),
        createMockTip({ amount: 250 }),
      ];

      mockTipRepository.find.mockResolvedValue(tips);

      const result = await service.getStaffEarnings('staff-uuid');

      expect(result.totalAmount).toBe(1750);
      expect(result.tipCount).toBe(3);
    });

    it('should filter by date range when provided', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockTipRepository.find.mockResolvedValue([]);

      await service.getStaffEarnings('staff-uuid', startDate, endDate);

      expect(mockTipRepository.find).toHaveBeenCalledWith({
        where: {
          staffProfileId: 'staff-uuid',
          createdAt: expect.objectContaining({
            _type: 'between',
            _value: [startDate, endDate],
          }),
        },
      });
    });

    it('should return zero earnings when staff has no tips', async () => {
      mockTipRepository.find.mockResolvedValue([]);

      const result = await service.getStaffEarnings('staff-uuid');

      expect(result.totalAmount).toBe(0);
      expect(result.tipCount).toBe(0);
    });

    it('should filter by start date only (from startDate to now)', async () => {
      const startDate = new Date('2024-06-01');

      mockTipRepository.find.mockResolvedValue([]);

      await service.getStaffEarnings('staff-uuid', startDate);

      expect(mockTipRepository.find).toHaveBeenCalledWith({
        where: {
          staffProfileId: 'staff-uuid',
          createdAt: expect.objectContaining({
            _type: 'between',
          }),
        },
      });

      // Verify the second value of between is a Date (now)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const callArg: any = mockTipRepository.find.mock.calls[0][0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const betweenValue = callArg.where.createdAt._value;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(betweenValue[0]).toEqual(startDate);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(betweenValue[1]).toBeInstanceOf(Date);
    });

    it('should filter by end date only (from epoch to endDate)', async () => {
      const endDate = new Date('2024-12-31');

      mockTipRepository.find.mockResolvedValue([]);

      await service.getStaffEarnings('staff-uuid', undefined, endDate);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const callArg2: any = mockTipRepository.find.mock.calls[0][0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const betweenValue2 = callArg2.where.createdAt._value;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(betweenValue2[0]).toEqual(new Date('1970-01-01'));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(betweenValue2[1]).toEqual(endDate);
    });
  });
});
