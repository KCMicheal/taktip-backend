import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayoutService } from '../../src/payouts/payouts.service';
import { Payout } from '../../src/payouts/entities/payout.entity';
import { PayoutStatus } from '../../src/payouts/enums/payout-status.enum';
import { Wallet } from '../../src/wallet/entities/wallet.entity';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';

describe('PayoutService', () => {
  let service: PayoutService;
  let payoutRepository: Repository<Payout>;
  let walletRepository: Repository<Wallet>;
  let staffProfileRepository: Repository<StaffProfile>;

  const mockPayoutEntityManager = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const mockPayoutRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: mockPayoutEntityManager,
  };

  const mockWalletEntityManager = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
    manager: mockWalletEntityManager,
  };

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockPayoutQueue = {
    add: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockPayout = (overrides: Partial<Payout> = {}): Payout => {
    const payout = new Payout();
    Object.assign(payout, {
      id: 'payout-uuid',
      staffProfileId: 'staff-uuid',
      amount: 5000,
      fee: 0,
      netAmount: 5000,
      bankAccount: { bankName: 'Test Bank', accountNumber: '0123456789' },
      payoutStatus: PayoutStatus.PENDING,
      reference: 'POUT-1712345678-a1b2c3d4',
      adminId: null,
      processedAt: null,
      notes: null,
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    });
    return payout;
  };

  const createMockProfile = (overrides: Partial<StaffProfile> = {}): StaffProfile => {
    const profile = new StaffProfile();
    Object.assign(profile, {
      id: 'staff-uuid',
      userId: 'user-uuid',
      merchantId: 'merchant-uuid',
      displayName: 'John Doe',
      payoutMethod: {
        bankName: 'Test Bank',
        accountNumber: '0123456789',
        accountName: 'John Doe',
      },
      ...overrides,
    });
    return profile;
  };

  const createMockWallet = (overrides: Partial<Wallet> = {}): Wallet => {
    const wallet = new Wallet();
    Object.assign(wallet, {
      id: 'wallet-uuid',
      ownerId: 'staff-uuid',
      ownerType: 'staff',
      balanceAvailable: 10000,
      balancePending: 0,
      balanceProcessing: 0,
      ...overrides,
    });
    return wallet;
  };

  // Helper to make walletEntityManager.transaction actually execute the callback
  // with itself as the entityManager parameter (so entityManager.query, .save, etc. work)
  const setupTransactionMock = () => {
    mockWalletEntityManager.transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      async (cb: (em: any) => Promise<any>) => cb(mockWalletEntityManager),
    );
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutService,
        {
          provide: getRepositoryToken(Payout),
          useValue: mockPayoutRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
        {
          provide: 'BullQueue_payouts',
          useValue: mockPayoutQueue,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PayoutService>(PayoutService);
    payoutRepository = module.get<Repository<Payout>>(getRepositoryToken(Payout));
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    staffProfileRepository = module.get<Repository<StaffProfile>>(
      getRepositoryToken(StaffProfile),
    );

    jest.clearAllMocks();
  });

  // ───────── requestPayout ─────────

  describe('requestPayout', () => {
    it('should create a payout by debiting balance_available and crediting balance_processing', async () => {
      const mockProfile = createMockProfile();
      const mockWallet = createMockWallet();

      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      setupTransactionMock();
      mockWalletEntityManager.query.mockResolvedValue([null, 1]); // UPDATE matched 1 row
      const createdPayout = createMockPayout({ reference: 'POUT-new-ref' });
      mockWalletEntityManager.create.mockReturnValue(createdPayout);
      mockWalletEntityManager.save.mockResolvedValue(createdPayout);

      const result = await service.requestPayout('user-uuid', 5000);

      expect(result.amount).toBe(5000);
      expect(result.netAmount).toBe(5000); // fee = 0 (PAYOUT_FEE_PERCENT = 0)

      // Verify atomic debit
      expect(mockWalletEntityManager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE "wallets" SET "balance_available"'),
        [5000, 'wallet-uuid'],
      );

      // Verify credit to processing
      expect(mockWalletEntityManager.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE "wallets" SET "balance_processing"'),
        [5000, 'wallet-uuid'],
      );

      expect(mockWalletEntityManager.create).toHaveBeenCalledWith(Payout, expect.objectContaining({
        staffProfileId: 'staff-uuid',
        amount: 5000,
        fee: 0,
        netAmount: 5000,
        payoutStatus: PayoutStatus.PENDING,
      }));
    });

    it('should throw NotFoundException when staff profile not found', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([]);

      await expect(
        service.requestPayout('user-uuid', 5000),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when staff has no payout method', async () => {
      const mockProfile = createMockProfile({ payoutMethod: null });
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);

      await expect(
        service.requestPayout('user-uuid', 5000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when staff wallet not found', async () => {
      const mockProfile = createMockProfile();

      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.requestPayout('user-uuid', 5000),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on insufficient balance', async () => {
      const mockProfile = createMockProfile();
      const mockWallet = createMockWallet({ balanceAvailable: 1000 });

      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      setupTransactionMock();
      mockWalletEntityManager.query.mockResolvedValue([null, 0]); // 0 rows matched (insufficient)

      await expect(
        service.requestPayout('user-uuid', 5000),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ───────── getMyPayouts ─────────

  describe('getMyPayouts', () => {
    it('should return payouts for a staff user ordered by creation date desc', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);

      const payouts = [
        createMockPayout({ id: 'payout-1', createdAt: new Date('2024-02-01') }),
        createMockPayout({ id: 'payout-2', createdAt: new Date('2024-01-01') }),
      ];
      mockPayoutRepository.find.mockResolvedValue(payouts);

      const result = await service.getMyPayouts('user-uuid');

      expect(result).toHaveLength(2);
      expect(mockPayoutRepository.find).toHaveBeenCalledWith({
        where: { staffProfileId: expect.objectContaining({ _value: ['staff-uuid'] }) },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when user has no staff profiles', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([]);

      const result = await service.getMyPayouts('user-uuid');

      expect(result).toEqual([]);
    });

    it('should handle multiple staff profiles', async () => {
      const mockProfiles = [
        createMockProfile({ id: 'staff-1' }),
        createMockProfile({ id: 'staff-2', userId: 'user-uuid' }),
      ];
      mockStaffProfileRepository.find.mockResolvedValue(mockProfiles);
      mockPayoutRepository.find.mockResolvedValue([]);

      await service.getMyPayouts('user-uuid');

      expect(mockPayoutRepository.find).toHaveBeenCalledWith({
        where: { staffProfileId: expect.objectContaining({ _value: ['staff-1', 'staff-2'] }) },
        order: { createdAt: 'DESC' },
      });
    });
  });

  // ───────── getAllPayouts ─────────

  describe('getAllPayouts', () => {
    it('should return all payouts ordered by creation date desc', async () => {
      const payouts = [createMockPayout()];
      mockPayoutRepository.find.mockResolvedValue(payouts);

      const result = await service.getAllPayouts();

      expect(result).toHaveLength(1);
      expect(mockPayoutRepository.find).toHaveBeenCalledWith({
        where: {},
        order: { createdAt: 'DESC' },
      });
    });

    it('should filter by payout status when provided', async () => {
      mockPayoutRepository.find.mockResolvedValue([]);

      await service.getAllPayouts(PayoutStatus.PENDING);

      expect(mockPayoutRepository.find).toHaveBeenCalledWith({
        where: { payoutStatus: PayoutStatus.PENDING },
        order: { createdAt: 'DESC' },
      });
    });
  });

  // ───────── approvePayout ─────────

  describe('approvePayout', () => {
    it('should approve a PENDING payout and enqueue to BullMQ', async () => {
      const payout = createMockPayout({ payoutStatus: PayoutStatus.PENDING });
      mockPayoutRepository.findOne.mockResolvedValue(payout);
      mockPayoutRepository.save.mockResolvedValue(payout);
      mockPayoutQueue.add.mockResolvedValue({ id: 'job-1' } as any);

      const result = await service.approvePayout('payout-uuid', 'admin-uuid');

      expect(result.payoutStatus).toBe(PayoutStatus.APPROVED);
      expect(result.adminId).toBe('admin-uuid');
      expect(mockPayoutQueue.add).toHaveBeenCalledWith('process-payout', {
        payoutId: 'payout-uuid',
      });
    });

    it('should throw NotFoundException when payout does not exist', async () => {
      mockPayoutRepository.findOne.mockResolvedValue(null);

      await expect(
        service.approvePayout('nonexistent', 'admin-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when payout is not PENDING', async () => {
      const payout = createMockPayout({ payoutStatus: PayoutStatus.APPROVED });
      mockPayoutRepository.findOne.mockResolvedValue(payout);

      await expect(
        service.approvePayout('payout-uuid', 'admin-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ───────── rejectPayout ─────────

  describe('rejectPayout', () => {
    it('should reject a PENDING payout and reverse wallet balances', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.PENDING,
        staffProfileId: 'staff-uuid',
      });
      const wallet = createMockWallet({ ownerId: 'staff-uuid' });

      mockPayoutRepository.findOne.mockResolvedValue(payout);
      mockWalletRepository.findOne.mockResolvedValue(wallet);

      setupTransactionMock();
      mockWalletEntityManager.query.mockResolvedValue([null, 1]);

      const result = await service.rejectPayout('payout-uuid', 'admin-uuid', 'Insufficient funds');

      expect(result.payoutStatus).toBe(PayoutStatus.REJECTED);
      expect(result.adminId).toBe('admin-uuid');
      expect(result.notes).toBe('Insufficient funds');

      // Verify debit of balance_processing
      expect(mockWalletEntityManager.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('UPDATE "wallets" SET "balance_processing"'),
        [5000, 'wallet-uuid'],
      );

      // Verify credit to balance_available
      expect(mockWalletEntityManager.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE "wallets" SET "balance_available"'),
        [5000, 'wallet-uuid'],
      );
    });

    it('should throw NotFoundException when payout does not exist', async () => {
      mockPayoutRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rejectPayout('nonexistent', 'admin-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when payout is not PENDING', async () => {
      const payout = createMockPayout({ payoutStatus: PayoutStatus.REJECTED });
      mockPayoutRepository.findOne.mockResolvedValue(payout);

      await expect(
        service.rejectPayout('payout-uuid', 'admin-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when staff wallet not found for reversal', async () => {
      const payout = createMockPayout({ payoutStatus: PayoutStatus.PENDING });
      mockPayoutRepository.findOne.mockResolvedValue(payout);
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rejectPayout('payout-uuid', 'admin-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────── processPayout ─────────

  describe('processPayout', () => {
    it('should complete an APPROVED payout (MVP simulation)', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.APPROVED,
        staffProfileId: 'staff-uuid',
      });
      const wallet = createMockWallet({ ownerId: 'staff-uuid', balanceProcessing: 5000 });

      mockPayoutRepository.findOne.mockResolvedValue(payout);

      // Mock wallet find and transaction
      mockWalletRepository.findOne.mockResolvedValue(wallet);
      setupTransactionMock();
      mockWalletEntityManager.query.mockResolvedValue([null, 1]);

      await service.processPayout('payout-uuid');

      expect(payout.payoutStatus).toBe(PayoutStatus.COMPLETED);
      expect(payout.processedAt).toBeInstanceOf(Date);
      expect(mockPayoutRepository.save).toHaveBeenCalledWith(payout);

      // Verify debit of balance_processing
      expect(mockWalletEntityManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "wallets" SET "balance_processing"'),
        [5000, 'wallet-uuid'],
      );
    });

    it('should skip when payout is not found', async () => {
      mockPayoutRepository.findOne.mockResolvedValue(null);

      // Should not throw
      await expect(
        service.processPayout('nonexistent'),
      ).resolves.toBeUndefined();
    });

    it('should skip when payout is not APPROVED', async () => {
      const payout = createMockPayout({ payoutStatus: PayoutStatus.PENDING });
      mockPayoutRepository.findOne.mockResolvedValue(payout);

      await expect(
        service.processPayout('payout-uuid'),
      ).resolves.toBeUndefined();
    });

    it('should mark payout as FAILED when wallet is not found', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.APPROVED,
        staffProfileId: 'staff-uuid',
      });

      mockPayoutRepository.findOne.mockResolvedValue(payout);
      mockWalletRepository.findOne.mockResolvedValue(null);

      await service.processPayout('payout-uuid');

      expect(payout.payoutStatus).toBe(PayoutStatus.FAILED);
      expect(payout.notes).toContain('Staff wallet not found');
    });
  });

  describe('escalatePayout', () => {
    it('should escalate a PENDING payout', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.PENDING,
      });

      mockPayoutRepository.findOne.mockResolvedValue(payout);

      const result = await service.escalatePayout('payout-uuid', 'admin-uuid', 'Flagged for review');

      expect(result.payoutStatus).toBe(PayoutStatus.ESCALATED);
      expect(result.adminId).toBe('admin-uuid');
      expect(result.notes).toBe('Flagged for review');
    });

    it('should escalate an APPROVED payout', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.APPROVED,
      });

      mockPayoutRepository.findOne.mockResolvedValue(payout);

      const result = await service.escalatePayout('payout-uuid', 'admin-uuid');

      expect(result.payoutStatus).toBe(PayoutStatus.ESCALATED);
    });

    it('should escalate a FAILED payout', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.FAILED,
      });

      mockPayoutRepository.findOne.mockResolvedValue(payout);

      const result = await service.escalatePayout('payout-uuid', 'admin-uuid');

      expect(result.payoutStatus).toBe(PayoutStatus.ESCALATED);
    });

    it('should throw BadRequestException for COMPLETED payout', async () => {
      const payout = createMockPayout({
        payoutStatus: PayoutStatus.COMPLETED,
      });

      mockPayoutRepository.findOne.mockResolvedValue(payout);

      await expect(service.escalatePayout('payout-uuid', 'admin-uuid'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when payout does not exist', async () => {
      mockPayoutRepository.findOne.mockResolvedValue(null);

      await expect(service.escalatePayout('nonexistent', 'admin-uuid'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
