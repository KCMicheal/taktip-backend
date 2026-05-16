import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { WalletService } from '../../src/wallet/wallet.service';
import { Wallet } from '../../src/wallet/entities/wallet.entity';
import { Transaction } from '../../src/wallet/entities/transaction.entity';
import { TransactionType } from '../../src/wallet/enums/transaction-type.enum';
import { TransactionStatus } from '../../src/wallet/enums/transaction-status.enum';
import { Role } from '../../src/auth/enums/role.enum';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: Repository<Wallet>;
  let transactionRepository: Repository<Transaction>;

  const mockEntityManager = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: mockEntityManager,
  };

  const mockTransactionRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockMerchant = {
    id: 'merchant-uuid',
    ownerId: 'user-uuid',
    name: 'Test Merchant',
  };

  const createMockWallet = (overrides: Partial<Wallet> = {}): Wallet => {
    const wallet = new Wallet();
    Object.assign(wallet, {
      id: 'wallet-uuid',
      merchantId: 'merchant-uuid',
      balance: 5000,
      currency: 'NGN',
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return wallet;
  };

  const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => {
    const tx = new Transaction();
    Object.assign(tx, {
      id: 'tx-uuid',
      walletId: 'wallet-uuid',
      type: TransactionType.DEPOSIT,
      amount: 1000,
      fee: 0,
      reference: 'DEP-001',
      description: 'Test transaction',
      transactionStatus: TransactionStatus.COMPLETED,
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return tx;
  };

  const mockUser = {
    sub: 'user-uuid',
    role: Role.MERCHANT,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );

    jest.clearAllMocks();

    // Default mock for manager.findOne (Merchant lookup)
    mockEntityManager.findOne.mockResolvedValue(mockMerchant);

    // Default mock for entityManager.create: merge input data with defaults
    mockEntityManager.create.mockImplementation(
      (_entityClass: unknown, data: Record<string, unknown>) => ({
        ...createMockTransaction(),
        ...data,
      }),
    );
  });

  describe('createWallet', () => {
    it('should create a wallet successfully', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null); // no existing wallet
      mockWalletRepository.create.mockReturnValue(createMockWallet());
      mockWalletRepository.save.mockResolvedValue(createMockWallet());

      const dto = { merchantId: 'merchant-uuid', currency: 'NGN' };
      const result = await service.createWallet(mockUser, dto);

      expect(result).toBeDefined();
      expect(result.merchantId).toBe('merchant-uuid');
      expect(mockWalletRepository.create).toHaveBeenCalledWith({
        merchantId: 'merchant-uuid',
        currency: 'NGN',
      });
      expect(mockWalletRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if wallet already exists', async () => {
      mockWalletRepository.findOne.mockResolvedValue(createMockWallet());

      const dto = { merchantId: 'merchant-uuid', currency: 'NGN' };
      await expect(service.createWallet(mockUser, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if merchant does not exist', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null); // no existing wallet
      mockEntityManager.findOne.mockResolvedValue(null); // merchant not found

      const dto = { merchantId: 'nonexistent-merchant', currency: 'NGN' };
      await expect(service.createWallet(mockUser, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not MERCHANT role', async () => {
      await expect(
        service.createWallet({ sub: 'user-uuid', role: Role.STAFF }, {
          merchantId: 'merchant-uuid',
          currency: 'NGN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use default currency NGN when not provided', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.create.mockReturnValue(createMockWallet());
      mockWalletRepository.save.mockResolvedValue(createMockWallet());

      const dto = { merchantId: 'merchant-uuid' };
      await service.createWallet(mockUser, dto);

      expect(mockWalletRepository.create).toHaveBeenCalledWith({
        merchantId: 'merchant-uuid',
        currency: 'NGN',
      });
    });
  });

  describe('getWalletById', () => {
    it('should return wallet when found', async () => {
      const mockWallet = createMockWallet();
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.getWalletById('wallet-uuid', mockUser);

      expect(result).toBeDefined();
      expect(result.id).toBe('wallet-uuid');
      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'wallet-uuid' },
      });
    });

    it('should throw NotFoundException when wallet not found', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getWalletById('nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getWalletByMerchantId', () => {
    it('should return wallet for valid merchantId', async () => {
      const mockWallet = createMockWallet();
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.getWalletByMerchantId('merchant-uuid', mockUser);

      expect(result.merchantId).toBe('merchant-uuid');
      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { merchantId: 'merchant-uuid' },
      });
    });

    it('should throw NotFoundException when no wallet for merchant', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getWalletByMerchantId('nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deposit', () => {
    it('should deposit funds and create transaction', async () => {
      const mockWallet = createMockWallet({ balance: 1000 });
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);

      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      // Atomic SQL increment — not checked for deposit (no guard needed)
      mockEntityManager.query.mockResolvedValue([]);
      // Sequence: 1st entityManager.findOne = assertOwnsWallet merchant lookup,
      //            2nd = wallet re-fetch inside transaction
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockMerchant)
        .mockResolvedValueOnce(createMockWallet({ balance: 1500 }));
      mockEntityManager.save.mockResolvedValue(undefined);

      const dto = {
        walletId: 'wallet-uuid',
        amount: 500,
        reference: 'DEP-001',
        description: 'Test deposit',
      };

      const result = await service.deposit(mockUser, dto);

      expect(result.wallet.balance).toBe(1500);
      expect(result.transaction.type).toBe(TransactionType.DEPOSIT);
      expect(result.transaction.transactionStatus).toBe(TransactionStatus.COMPLETED);
      // Verify atomic SQL was used (not in-memory save)
      expect(mockEntityManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "wallets"'),
        [500, 'wallet-uuid'],
      );
    });

    it('should generate reference when not provided', async () => {
      const mockWallet = createMockWallet({ balance: 1000 });
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);
      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      mockEntityManager.query.mockResolvedValue([]);
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockMerchant)
        .mockResolvedValueOnce(createMockWallet({ balance: 1500 }));
      mockEntityManager.save.mockResolvedValue(undefined);

      const dto = { walletId: 'wallet-uuid', amount: 500 };

      const result = await service.deposit(mockUser, dto);

      expect(result.transaction.reference).toMatch(/^DEP-/);
    });

    it('should throw ForbiddenException for non-merchant role', async () => {
      await expect(
        service.deposit({ sub: 'user-uuid', role: Role.CUSTOMER }, {
          walletId: 'wallet-uuid',
          amount: 500,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for nonexistent wallet', async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deposit(mockUser, { walletId: 'nonexistent', amount: 500 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('withdraw', () => {
    it('should withdraw funds and create transaction', async () => {
      const mockWallet = createMockWallet({ balance: 2000 });
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);
      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      // Atomic SQL decrement — 1 row affected (guard passes)
      mockEntityManager.query.mockResolvedValue([{}]);
      // Sequence: 1st findOne = assertOwnsWallet (merchant), 2nd = tx re-fetch
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockMerchant)
        .mockResolvedValueOnce(createMockWallet({ balance: 1500 }));
      mockEntityManager.save.mockResolvedValue(undefined);

      const dto = {
        walletId: 'wallet-uuid',
        amount: 500,
        reference: 'WTH-001',
        description: 'Test withdrawal',
      };

      const result = await service.withdraw(mockUser, dto);

      expect(result.wallet.balance).toBe(1500);
      expect(result.transaction.type).toBe(TransactionType.WITHDRAW);
      // Verify atomic SQL with guard was used
      expect(mockEntityManager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "wallets"'),
        [500, 'wallet-uuid'],
      );
    });

    it('should throw BadRequestException for insufficient balance', async () => {
      const mockWallet = createMockWallet({ balance: 100 });
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);
      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      mockEntityManager.findOne.mockResolvedValueOnce(mockMerchant);
      // Atomic SQL decrement — 0 rows affected (guard fails because balance < amount)
      mockEntityManager.query.mockResolvedValue([]);

      const dto = { walletId: 'wallet-uuid', amount: 500 };

      await expect(service.withdraw(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate reference when not provided', async () => {
      const mockWallet = createMockWallet({ balance: 2000 });
      mockWalletRepository.findOne.mockResolvedValue(mockWallet);
      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      mockEntityManager.query.mockResolvedValue([{}]);
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockMerchant)
        .mockResolvedValueOnce(createMockWallet({ balance: 1500 }));
      mockEntityManager.save.mockResolvedValue(undefined);

      const dto = { walletId: 'wallet-uuid', amount: 500 };

      const result = await service.withdraw(mockUser, dto);

      expect(result.transaction.reference).toMatch(/^WTH-/);
    });

    it('should throw ForbiddenException for non-merchant role', async () => {
      await expect(
        service.withdraw({ sub: 'user-uuid', role: Role.STAFF }, {
          walletId: 'wallet-uuid',
          amount: 500,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const mockTxs = [
        createMockTransaction({ id: 'tx-1' }),
        createMockTransaction({ id: 'tx-2' }),
      ];
      mockTransactionRepository.findAndCount.mockResolvedValue([mockTxs, 2]);

      const result = await service.getTransactions(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockTransactionRepository.findAndCount).toHaveBeenCalledWith({
        where: { walletId: 'wallet-uuid' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should use default pagination when not specified', async () => {
      mockTransactionRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.getTransactions('wallet-uuid', mockUser, {});

      expect(mockTransactionRepository.findAndCount).toHaveBeenCalledWith({
        where: { walletId: 'wallet-uuid' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('transfer', () => {
    it('should transfer funds between wallets', async () => {
      const sourceWallet = createMockWallet({
        id: 'source-uuid',
        balance: 3000,
      });
      const destWallet = createMockWallet({
        id: 'dest-uuid',
        merchantId: 'merchant-2',
        balance: 1000,
      });

      mockWalletRepository.findOne
        .mockResolvedValueOnce(sourceWallet)
        .mockResolvedValueOnce(destWallet);

      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      // Atomic SQL: source decrement succeeds (1 row), dest increment (no check)
      mockEntityManager.query
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([]);
      mockEntityManager.create
        .mockReturnValueOnce(createMockTransaction({ type: TransactionType.TRANSFER_OUT, reference: 'TRF_OUT-1' }))
        .mockReturnValueOnce(createMockTransaction({ type: TransactionType.TRANSFER_IN, reference: 'TRF_IN-1' }));
      mockEntityManager.save.mockResolvedValue(undefined);
      // Sequence: 1st findOne = assertOwnsWallet (merchant lookup),
      //            2nd = source wallet re-fetch, 3rd = dest wallet re-fetch
      mockEntityManager.findOne
        .mockResolvedValueOnce(mockMerchant)
        .mockResolvedValueOnce(createMockWallet({ id: 'source-uuid', balance: 2000 }))
        .mockResolvedValueOnce(createMockWallet({ id: 'dest-uuid', merchantId: 'merchant-2', balance: 2000 }));

      const dto = {
        sourceWalletId: 'source-uuid',
        destinationWalletId: 'dest-uuid',
        amount: 1000,
        description: 'Test transfer',
      };

      const result = await service.transfer(mockUser, dto);

      expect(result.sourceWallet.balance).toBe(2000);
      expect(result.destWallet.balance).toBe(2000);
      expect(result.sourceTx.type).toBe(TransactionType.TRANSFER_OUT);
      expect(result.destTx.type).toBe(TransactionType.TRANSFER_IN);
      // Verify atomic SQL with guard on source
      expect(mockEntityManager.query).toHaveBeenNthCalledWith(1,
        expect.stringContaining('UPDATE "wallets"'),
        [1000, 'source-uuid'],
      );
    });

    it('should throw BadRequestException when source and destination are the same', async () => {
      const dto = {
        sourceWalletId: 'same-uuid',
        destinationWalletId: 'same-uuid',
        amount: 1000,
      };

      await expect(service.transfer(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for insufficient source balance', async () => {
      const sourceWallet = createMockWallet({
        id: 'source-uuid',
        balance: 100,
      });
      const destWallet = createMockWallet({
        id: 'dest-uuid',
        merchantId: 'merchant-2',
        balance: 1000,
      });

      mockWalletRepository.findOne
        .mockResolvedValueOnce(sourceWallet)
        .mockResolvedValueOnce(destWallet);

      (mockEntityManager.transaction).mockImplementation(async (cb: (em: typeof mockEntityManager) => Promise<unknown>) => cb(mockEntityManager));
      mockEntityManager.findOne.mockResolvedValueOnce(mockMerchant);
      // Atomic SQL on source returns 0 rows — guard fails, no need for dest mock
      mockEntityManager.query.mockResolvedValue([]);

      const dto = {
        sourceWalletId: 'source-uuid',
        destinationWalletId: 'dest-uuid',
        amount: 500,
      };

      await expect(service.transfer(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException for non-merchant role', async () => {
      const dto = {
        sourceWalletId: 'source-uuid',
        destinationWalletId: 'dest-uuid',
        amount: 1000,
      };

      await expect(
        service.transfer({ sub: 'user-uuid', role: Role.ADMIN }, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
