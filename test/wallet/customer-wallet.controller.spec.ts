import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomerWalletController } from '../../src/wallet/customer-wallet.controller';
import { WalletService } from '../../src/wallet/wallet.service';
import { CustomerService } from '../../src/customer/customer.service';
import { TipsService } from '../../src/tips/tips.service';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { User } from '../../src/auth/entities/user.entity';
import { Payment } from '../../src/payments/entities/payment.entity';

import { PAYMENT_PROVIDER } from '../../src/payments/providers/providers.constants';
import { Role } from '../../src/auth/enums/role.enum';

describe('CustomerWalletController', () => {
  let controller: CustomerWalletController;
  let walletService: WalletService;
  let customerService: CustomerService;
  let tipsService: TipsService;
  let staffProfileRepository: Record<string, jest.Mock>;

  const mockWalletService = {
    getOrCreateCustomerWallet: jest.fn(),
    deposit: jest.fn(),
    getTransactions: jest.fn(),
    getStaffWallet: jest.fn(),
    tipFromBalance: jest.fn(),
  };

  const mockCustomerService = {
    getOrCreateProfile: jest.fn(),
  };

  const mockTipsService = {
    recordTip: jest.fn(),
  };

  const mockStaffProfileRepo = {
    findOne: jest.fn(),
  };

  const mockPaymentProvider = {
    initializeTransaction: jest.fn(),
    verifyTransaction: jest.fn(),
    handleWebhook: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  const mockPaymentRepo = {
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
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

  const mockStaffProfile = {
    id: 'staff-profile-uuid',
    userId: 'staff-user-uuid',
    merchantId: 'merchant-uuid',
    displayName: 'John Staff',
  };

  const mockStaffWallet = {
    id: 'staff-wallet-uuid',
    ownerId: 'staff-profile-uuid',
    ownerType: 'staff',
    balanceAvailable: 500,
    currency: 'NGN',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransactions = {
    tipOutTx: { id: 'tx-out-uuid', type: 5, amount: 500, fee: 25 },
    tipInTx: { id: 'tx-in-uuid', type: 6, amount: 475, fee: 0 },
    feeTx: { id: 'tx-fee-uuid', type: 7, amount: 25, fee: 0 },
  };

  const mockTip = {
    id: 'tip-uuid',
    merchantId: 'merchant-uuid',
    staffProfileId: 'staff-profile-uuid',
    customerProfileId: 'customer-profile-uuid',
    amount: 500,
    currency: 'NGN',
    message: 'Great service!',
    source: 2,
    tipStatus: 1,
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
          provide: TipsService,
          useValue: mockTipsService,
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepo,
        },
        {
          provide: PAYMENT_PROVIDER,
          useValue: mockPaymentProvider,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: Reflector,
          useValue: { get: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<CustomerWalletController>(CustomerWalletController);
    walletService = module.get<WalletService>(WalletService);
    customerService = module.get<CustomerService>(CustomerService);
    tipsService = module.get<TipsService>(TipsService);
    staffProfileRepository = module.get(getRepositoryToken(StaffProfile));

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
    it('should initiate a Paystack deposit and return authorization URL', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-uuid', email: 'user@example.com' });
      mockPaymentProvider.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/abc123',
        reference: 'TXT-1712345678-abc',
      });

      const dto = { amount: 1000 };
      const result = await controller.deposit(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data.authorizationUrl).toBe('https://checkout.paystack.com/abc123');
      expect(result.data.reference).toBe('TXT-1712345678-abc');
      expect(mockCustomerService.getOrCreateProfile).toHaveBeenCalledWith('user-uuid');
      expect(mockWalletService.getOrCreateCustomerWallet).toHaveBeenCalledWith('customer-profile-uuid');
      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { id: 'user-uuid' } });
      expect(mockPaymentProvider.initializeTransaction).toHaveBeenCalledWith({
        email: 'user@example.com',
        amount: 1000,

        metadata: {
          walletId: 'wallet-uuid',
          deposit: true,
        },
      });
    });
  });

  describe('POST /customer/wallet/tip', () => {
    it('should tip a staff member from wallet balance', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockStaffProfileRepo.findOne.mockResolvedValue(mockStaffProfile);
      mockWalletService.getStaffWallet.mockResolvedValue(mockStaffWallet);
      mockWalletService.tipFromBalance.mockResolvedValue(mockTransactions);
      mockTipsService.recordTip.mockResolvedValue(mockTip);

      const dto = { staffProfileId: 'staff-profile-uuid', amount: 500, message: 'Great service!' };
      const result = await controller.tipFromWallet(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data.tip).toEqual(mockTip);
      expect(result.data.transactions).toEqual(mockTransactions);

      expect(mockCustomerService.getOrCreateProfile).toHaveBeenCalledWith('user-uuid');
      expect(mockWalletService.getOrCreateCustomerWallet).toHaveBeenCalledWith('customer-profile-uuid');
      expect(mockStaffProfileRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'staff-profile-uuid' },
      });
      expect(mockWalletService.getStaffWallet).toHaveBeenCalledWith('staff-profile-uuid');
      expect(mockWalletService.tipFromBalance).toHaveBeenCalledWith(
        'wallet-uuid',
        'staff-wallet-uuid',
        500,
      );
      expect(mockTipsService.recordTip).toHaveBeenCalledWith({
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-profile-uuid',
        customerProfileId: 'customer-profile-uuid',
        amount: 500,
        currency: 'NGN',
        message: 'Great service!',
        source: 2,
      });
    });

    it('should throw NotFoundException when staff profile not found', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockStaffProfileRepo.findOne.mockResolvedValue(null);

      const dto = { staffProfileId: 'unknown-staff', amount: 500 };

      await expect(controller.tipFromWallet(mockUser, dto)).rejects.toThrow(
        'Staff profile not found',
      );

      expect(mockWalletService.tipFromBalance).not.toHaveBeenCalled();
      expect(mockTipsService.recordTip).not.toHaveBeenCalled();
    });

    it('should throw error when staff wallet not found', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockStaffProfileRepo.findOne.mockResolvedValue(mockStaffProfile);
      mockWalletService.getStaffWallet.mockRejectedValue(
        new Error('Staff wallet not found'),
      );

      const dto = { staffProfileId: 'staff-profile-uuid', amount: 500 };

      await expect(controller.tipFromWallet(mockUser, dto)).rejects.toThrow(
        'Staff wallet not found',
      );

      expect(mockWalletService.tipFromBalance).not.toHaveBeenCalled();
      expect(mockTipsService.recordTip).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when insufficient balance', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockStaffProfileRepo.findOne.mockResolvedValue(mockStaffProfile);
      mockWalletService.getStaffWallet.mockResolvedValue(mockStaffWallet);
      mockWalletService.tipFromBalance.mockRejectedValue(
        new Error('Insufficient balance in customer wallet'),
      );

      const dto = { staffProfileId: 'staff-profile-uuid', amount: 99999 };

      await expect(controller.tipFromWallet(mockUser, dto)).rejects.toThrow(
        'Insufficient balance in customer wallet',
      );

      expect(mockTipsService.recordTip).not.toHaveBeenCalled();
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

      const result = await controller.getMyTransactions(mockUser, { page: 1, limit: 20 });

      expect(result.status).toBe('success');
      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(2);
    });

    it('should use default pagination when not provided', async () => {
      mockCustomerService.getOrCreateProfile.mockResolvedValue(mockCustomerProfile);
      mockWalletService.getOrCreateCustomerWallet.mockResolvedValue(mockWallet);
      mockWalletService.getTransactions.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.getMyTransactions(mockUser, {});

      expect(mockWalletService.getTransactions).toHaveBeenCalledWith('wallet-uuid', mockUser, {});
    });
  });
});
