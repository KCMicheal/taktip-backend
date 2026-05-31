import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { WalletController } from '../../src/wallet/wallet.controller';
import { WalletService } from '../../src/wallet/wallet.service';
import { Role } from '../../src/auth/enums/role.enum';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: WalletService;

  const mockWalletService = {
    createWallet: jest.fn(),
    getWalletById: jest.fn(),
    getWalletByMerchantId: jest.fn(),
    deposit: jest.fn(),
    withdraw: jest.fn(),
    getTransactions: jest.fn(),
    transfer: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-uuid', role: Role.MERCHANT }),
    signAsync: jest.fn(),
  };

  const mockUser = {
    sub: 'user-uuid',
    role: Role.MERCHANT,
  };

  const mockWallet = {
    id: 'wallet-uuid',
    ownerId: 'merchant-uuid',
    ownerType: 'merchant',
    balanceAvailable: 5000,
    balancePending: 0,
    balanceProcessing: 0,
    currency: 'NGN',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction = {
    id: 'tx-uuid',
    walletId: 'wallet-uuid',
    type: 1,
    amount: 1000,
    fee: 0,
    reference: 'DEP-001',
    description: 'Test',
    transactionStatus: 2,
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: mockWalletService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    walletService = module.get<WalletService>(WalletService);

    jest.clearAllMocks();
  });

  describe('createWallet', () => {
    it('should create a wallet and return success', async () => {
      mockWalletService.createWallet.mockResolvedValue(mockWallet);

      const dto = { ownerId: 'merchant-uuid', ownerType: 'merchant', currency: 'NGN' };
      const result = await controller.createWallet(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockWallet);
      expect(mockWalletService.createWallet).toHaveBeenCalledWith(mockUser, dto);
    });
  });

  describe('getWallet', () => {
    it('should return wallet by ID', async () => {
      mockWalletService.getWalletById.mockResolvedValue(mockWallet);

      const result = await controller.getWallet('wallet-uuid', mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockWallet);
      expect(mockWalletService.getWalletById).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
      );
    });
  });

  describe('getMerchantWallet', () => {
    it('should return wallet by merchant ID', async () => {
      mockWalletService.getWalletByMerchantId.mockResolvedValue(mockWallet);

      const result = await controller.getMerchantWallet('merchant-uuid', mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockWallet);
      expect(mockWalletService.getWalletByMerchantId).toHaveBeenCalledWith(
        'merchant-uuid',
        mockUser,
      );
    });
  });

  describe('deposit', () => {
    it('should deposit and return wallet + transaction', async () => {
      const expectedData = { wallet: mockWallet, transaction: mockTransaction };
      mockWalletService.deposit.mockResolvedValue(expectedData);

      const dto = {
        walletId: 'wallet-uuid',
        amount: 1000,
        reference: 'DEP-001',
        description: 'Test deposit',
      };
      const result = await controller.deposit(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockWalletService.deposit).toHaveBeenCalledWith(mockUser, dto);
    });
  });

  describe('withdraw', () => {
    it('should withdraw and return wallet + transaction', async () => {
      const expectedData = { wallet: mockWallet, transaction: mockTransaction };
      mockWalletService.withdraw.mockResolvedValue(expectedData);

      const dto = {
        walletId: 'wallet-uuid',
        amount: 500,
        reference: 'WTH-001',
        description: 'Test withdrawal',
      };
      const result = await controller.withdraw(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockWalletService.withdraw).toHaveBeenCalledWith(mockUser, dto);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const expectedData = {
        items: [mockTransaction],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockWalletService.getTransactions.mockResolvedValue(expectedData);

      const result = await controller.getTransactions(
        'wallet-uuid',
        mockUser,
        '1',
        '20',
      );

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );
    });

    it('should use default pagination when not specified', async () => {
      mockWalletService.getTransactions.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.getTransactions('wallet-uuid', mockUser, undefined, undefined);

      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );
    });
  });

  describe('transfer', () => {
    it('should transfer between wallets and return result', async () => {
      const expectedData = {
        sourceWallet: { ...mockWallet, id: 'source-uuid' },
        destWallet: { ...mockWallet, id: 'dest-uuid' },
        sourceTx: { ...mockTransaction, type: 4 },
        destTx: { ...mockTransaction, type: 3 },
      };
      mockWalletService.transfer.mockResolvedValue(expectedData);

      const dto = {
        sourceWalletId: 'source-uuid',
        destinationWalletId: 'dest-uuid',
        amount: 1000,
        description: 'Test transfer',
      };
      const result = await controller.transfer(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockWalletService.transfer).toHaveBeenCalledWith(mockUser, dto);
    });
  });
});
