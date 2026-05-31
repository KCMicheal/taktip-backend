import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipsService } from '../../src/tips/tips.service';
import { Tip } from '../../src/tips/entities/tip.entity';
import { TipSource } from '../../src/tips/enums/tip-source.enum';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';

describe('TipsService', () => {
  let service: TipsService;
  let tipRepository: Repository<Tip>;
  let staffProfileRepository: Repository<StaffProfile>;

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
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01T12:00:00Z'),
      updatedAt: new Date('2024-01-01T12:00:00Z'),
      ...overrides,
    });
    return tip;
  };

  const createMockProfile = (overrides: Partial<StaffProfile> = {}): StaffProfile => {
    const profile = new StaffProfile();
    Object.assign(profile, {
      id: 'staff-uuid',
      userId: 'user-uuid',
      merchantId: 'merchant-uuid',
      displayName: 'John Doe',
      ...overrides,
    });
    return profile;
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
      ],
    }).compile();

    service = module.get<TipsService>(TipsService);
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    staffProfileRepository = module.get<Repository<StaffProfile>>(
      getRepositoryToken(StaffProfile),
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

      const result = await service.findByStaff('staff-uuid', 1, 20);

      expect(result.tips).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockTipRepository.findAndCount).toHaveBeenCalledWith({
        where: { staffProfileId: 'staff-uuid' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should paginate correctly', async () => {
      mockTipRepository.findAndCount.mockResolvedValue([[], 0]);

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

      expect(result.tips).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ───────── findByMerchant ─────────

  describe('findByMerchant', () => {
    it('should return paginated tips enriched with staff names', async () => {
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
        createMockProfile({ id: 'staff-1', displayName: 'Alice' }),
        createMockProfile({ id: 'staff-2', displayName: 'Bob' }),
      ];

      mockTipRepository.findAndCount.mockResolvedValue([tips, 2]);
      mockStaffProfileRepository.findBy.mockResolvedValue(staffProfiles);

      const result = await service.findByMerchant('merchant-uuid', 1, 20);

      expect(result.total).toBe(2);
      expect(result.tips).toHaveLength(2);
      expect(result.tips[0].staffName).toBe('Alice');
      expect(result.tips[0].amount).toBe(500);
      expect(result.tips[1].staffName).toBe('Bob');
      expect(result.tips[1].message).toBe('Thanks!');
      expect(result.tips[1].rating).toBe(4);
      expect(mockStaffProfileRepository.findBy).toHaveBeenCalledTimes(1);
    });

    it('should handle staff profiles not found gracefully', async () => {
      const tips = [
        createMockTip({ id: 'tip-1', staffProfileId: 'unknown-staff' }),
      ];

      mockTipRepository.findAndCount.mockResolvedValue([tips, 1]);
      mockStaffProfileRepository.findBy.mockResolvedValue([]);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result.tips[0].staffName).toBe('Unknown Staff');
    });

    it('should return empty result for merchant with no tips', async () => {
      mockTipRepository.findAndCount.mockResolvedValue([[], 0]);
      mockStaffProfileRepository.findBy.mockResolvedValue([]);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result.tips).toEqual([]);
      expect(result.total).toBe(0);
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
      expect(betweenValue[0]).toEqual(startDate);
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
      expect(betweenValue2[0]).toEqual(new Date('1970-01-01'));
      expect(betweenValue2[1]).toEqual(endDate);
    });
  });
});
