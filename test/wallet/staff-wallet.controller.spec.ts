import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { StaffWalletController } from '../../src/wallet/staff-wallet.controller';
import { WalletService } from '../../src/wallet/wallet.service';
import { Role } from '../../src/auth/enums/role.enum';

describe('StaffWalletController', () => {
  let controller: StaffWalletController;
  let walletService: WalletService;

  const mockWalletService = {
    getStaffConsolidatedWallets: jest.fn(),
    getTransactions: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-uuid', role: Role.STAFF }),
    signAsync: jest.fn(),
  };

  const mockUser = {
    sub: 'user-uuid',
    role: Role.STAFF,
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

  const mockConsolidatedView = {
    wallets: [
      {
        id: 'wallet-1-uuid',
        merchantName: "Joe's Diner",
        merchantShortCode: 'JOE123',
        balanceAvailable: 450.0,
        balancePending: 50.0,
        balanceProcessing: 0.0,
        reference: 'WAL-ABC123',
      },
      {
        id: 'wallet-2-uuid',
        merchantName: "Mario's Pizza",
        merchantShortCode: 'MAR456',
        balanceAvailable: 120.0,
        balancePending: 30.0,
        balanceProcessing: 0.0,
        reference: 'WAL-DEF456',
      },
    ],
    totalBalances: {
      balanceAvailable: 570.0,
      balancePending: 80.0,
      balanceProcessing: 0.0,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffWalletController],
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

    controller = module.get<StaffWalletController>(StaffWalletController);
    walletService = module.get<WalletService>(WalletService);

    jest.clearAllMocks();
  });

  describe('getMyWallets', () => {
    it('should return consolidated staff wallet view', async () => {
      mockWalletService.getStaffConsolidatedWallets.mockResolvedValue(mockConsolidatedView);

      const result = await controller.getMyWallets(mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockConsolidatedView);
      expect(result.data.wallets).toHaveLength(2);
      expect(result.data.totalBalances.balanceAvailable).toBe(570.0);
      expect(mockWalletService.getStaffConsolidatedWallets).toHaveBeenCalledWith(mockUser);
    });

    it('should return empty wallets when staff has no profiles', async () => {
      const emptyView = {
        wallets: [],
        totalBalances: {
          balanceAvailable: 0,
          balancePending: 0,
          balanceProcessing: 0,
        },
      };
      mockWalletService.getStaffConsolidatedWallets.mockResolvedValue(emptyView);

      const result = await controller.getMyWallets(mockUser);

      expect(result.status).toBe('success');
      expect(result.data.wallets).toHaveLength(0);
      expect(result.data.totalBalances.balanceAvailable).toBe(0);
    });
  });

  describe('getWalletTransactions', () => {
    it('should return paginated transactions for a specific staff wallet', async () => {
      const expectedTransactions = {
        items: [mockTransaction],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockWalletService.getTransactions.mockResolvedValue(expectedTransactions);

      const result = await controller.getWalletTransactions('wallet-uuid', mockUser, '1', '20');

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedTransactions);
      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );
    });

    it('should use default pagination when not specified', async () => {
      mockWalletService.getTransactions.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.getWalletTransactions('wallet-uuid', mockUser, undefined, undefined);

      expect(mockWalletService.getTransactions).toHaveBeenCalledWith(
        'wallet-uuid',
        mockUser,
        { page: 1, limit: 20 },
      );
    });
  });
});
