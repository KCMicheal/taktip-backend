import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CustomerWalletController } from '../../src/wallet/customer-wallet.controller';
import { WalletService } from '../../src/wallet/wallet.service';
import { CustomerService } from '../../src/customer/customer.service';
import { Role } from '../../src/auth/enums/role.enum';

describe('CustomerWalletController', () => {
  let controller: CustomerWalletController;
  let walletService: WalletService;
  let customerService: CustomerService;

  const mockWalletService = {
    getOrCreateCustomerWallet: jest.fn(),
    deposit: jest.fn(),
    getTransactions: jest.fn(),
  };

  const mockCustomerService = {
    getOrCreateProfile: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-uuid', role: Role.CUSTOMER }),
    signAsync: jest.fn(),
  };

  const mockUser = {
    sub: 'user-uuid',
    role: Role.CUSTOMER,
  };

  const mockWallet = {
    id: 'wallet-uuid',
    ownerId: 'customer-profile-uuid',
    ownerType: 'customer',
    balanceAvailable: 1000,
    balancePending: 0,
    balanceProcessing: 0,
    currency: 'NGN',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomerProfile = {
    id: 'customer-profile-uuid',
    userId: 'user-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerWalletController],
      providers: [
        {
          provide: WalletService,
          useValue: mockWalletService,
        },
        {
          provide: CustomerService,
          useValue: mockCustomerService,
        },
        {
          provide: Reflector,
          useValue: { get: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    controller = module.get<CustomerWalletController>(CustomerWalletController);
    walletService = module.get<WalletService>(WalletService);
    customerService = module.get<CustomerService>(CustomerService);

    jest.clearAllMocks();
  });

  describe('GET /customer/wallet', () => {
    it('should return the customer wallet', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);

      const result = await controller.getMyWallet(mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockWallet);
      expect(mockCustomerService.getOrCreateProfile).toHaveBeenCalledWith('user-uuid');
      expect(mockWalletService.getOrCreateCustomerWallet).toHaveBeenCalledWith('customer-profile-uuid');
    });
  });

  describe('POST /customer/wallet/deposit', () => {
    it('should deposit funds to customer wallet', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockWalletService.deposit.mockResolvedValue({
        wallet: { ...mockWallet, balanceAvailable: 2000 },
        transaction: {
          id: 'tx-uuid',
          walletId: 'wallet-uuid',
          type: 1,
          amount: 1000,
          fee: 0,
          reference: 'DEP-001',
          description: 'Pre-funding',
          transactionStatus: 2,
          status: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const dto = { amount: 1000, reference: 'DEP-001', description: 'Pre-funding' };
      const result = await controller.deposit(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data.wallet.balanceAvailable).toBe(2000);
      expect(mockWalletService.deposit).toHaveBeenCalledWith(mockUser, {
        walletId: 'wallet-uuid',
        amount: 1000,
        reference: 'DEP-001',
        description: 'Pre-funding',
      });
    });
  });

  describe('GET /customer/wallet/transactions', () => {
    it('should return paginated transactions', async () => {
      const mockTransactions = [
        { id: 'tx-1', walletId: 'wallet-uuid', type: 1, amount: 1000, fee: 0, reference: 'DEP-001', description: 'Deposit', transactionStatus: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },
        { id: 'tx-2', walletId: 'wallet-uuid', type: 6, amount: 475, fee: 25, reference: 'TIP_IN-001', description: 'Tip received', transactionStatus: 2, status: 1, createdAt: new Date(), updatedAt: new Date() },
      ];

      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockWalletService.getTransactions.mockResolvedValue({ items: mockTransactions, total: 2, page: 1, limit: 20 });

      const result = await controller.getMyTransactions(mockUser, '1', '20');

      expect(result.status).toBe('success');
      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it('should use default pagination when not provided', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockWalletService.getTransactions.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.getMyTransactions(mockUser, undefined, undefined);

      expect(mockWalletService.getTransactions).toHaveBeenCalledWith('wallet-uuid', mockUser, { page: 1, limit: 20 });
    });
  });
});
