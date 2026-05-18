import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { MerchantWalletController } from '../../src/wallet/merchant-wallet.controller';
import { WalletService } from '../../src/wallet/wallet.service';
import { Role } from '../../src/auth/enums/role.enum';

describe('MerchantWalletController', () => {
  let controller: MerchantWalletController;
  let walletService: WalletService;

  const mockWalletService = {
    getWalletByOwnerId: jest.fn(),
    getMerchantWalletByUserId: jest.fn(),
    getTransactions: jest.fn(),
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
      controllers: [MerchantWalletController],
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

    controller = module.get<MerchantWalletController>(MerchantWalletController);
    walletService = module.get<WalletService>(WalletService);

    jest.clearAllMocks();
  });

  describe('getMyWallet', () => {
    it('should return the merchant\'s own wallet', async () => {
      mockWalletService.getMerchantWalletByUserId.mockResolvedValue(mockWallet);

      const result = await controller.getMyWallet(mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockWallet);
      expect(mockWalletService.getMerchantWalletByUserId).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('getMyTransactions', () => {
    it('should return paginated transactions for the merchant\'s wallet', async () => {
      const expectedTransactions = {
        transactions: [mockTransaction],
        total: 1,
      };
      mockWalletService.getMerchantWalletByUserId.mockResolvedValue(mockWallet);
      mockWalletService.getTransactions.mockResolvedValue(expectedTransactions);

      const result = await controller.getMyTransactions(mockUser, '1', '20');

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedTransactions);
      expect(mockWalletService.getMerchantWalletByUserId).toHaveBeenCalledWith(mockUser);
      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );
    });

    it('should use default pagination when not specified', async () => {
      mockWalletService.getMerchantWalletByUserId.mockResolvedValue(mockWallet);
      mockWalletService.getTransactions.mockResolvedValue({ transactions: [], total: 0 });

      await controller.getMyTransactions(mockUser, undefined, undefined);

      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );
    });
  });
});
