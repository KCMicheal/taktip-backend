import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomerTipsController } from '../../src/customer-tips/customer-tips.controller';
import { CustomerTipsService } from '../../src/customer-tips/customer-tips.service';
import { CustomerService } from '../../src/customer/customer.service';
import { WalletService } from '../../src/wallet/wallet.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../../src/auth/services/mail.service';
import { Tip } from '../../src/tips/entities/tip.entity';
import { CustomerProfile } from '../../src/customer/entities/customer-profile.entity';
import { Payment } from '../../src/payments/entities/payment.entity';
import { Wallet } from '../../src/wallet/entities/wallet.entity';
import { User } from '../../src/auth/entities/user.entity';
import { PAYMENT_PROVIDER } from '../../src/payments/providers/providers.constants';
import { TipSource } from '../../src/tips/enums/tip-source.enum';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { C2cTipFundingSource } from '../../src/tips/enums/c2c-tip-funding-source.enum';
import { Role } from '../../src/auth/enums/role.enum';

describe('CustomerTipsController', () => {
  let controller: CustomerTipsController;

  const mockUser = { sub: 'user-uuid', role: Role.CUSTOMER };

  // ── Mock Payment Provider ──
  const mockPaymentProvider = {
    name: 'paystack',
    initializeTransaction: jest.fn(),
    verifyTransaction: jest.fn(),
    handleWebhook: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  // ── Mock Services & Repos ──
  const mockCustomerTipsService = {
    sendTip: jest.fn(),
    searchCustomers: jest.fn(),
    getMyTipHistory: jest.fn(),
  };

  const mockCustomerService = {};
  const mockWalletService = {};
  const mockConfigService = {};
  const mockMailService = {};
  const mockTipRepo = {};
  const mockCustomerProfileRepo = {};
  const mockPaymentRepo = {};
  const mockWalletRepo = {};
  const mockUserRepo = {};

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-uuid', role: Role.CUSTOMER }),
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerTipsController],
      providers: [
        {
          provide: CustomerTipsService,
          useValue: mockCustomerTipsService,
        },
        {
          provide: PAYMENT_PROVIDER,
          useValue: mockPaymentProvider,
        },
        {
          provide: getRepositoryToken(Tip),
          useValue: mockTipRepo,
        },
        {
          provide: getRepositoryToken(CustomerProfile),
          useValue: mockCustomerProfileRepo,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepo,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: CustomerService,
          useValue: mockCustomerService,
        },
        {
          provide: WalletService,
          useValue: mockWalletService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
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

    controller = module.get<CustomerTipsController>(CustomerTipsController);

    jest.clearAllMocks();
  });

  describe('POST /customer/tips/send', () => {
    it('should send a wallet-funded tip and return success', async () => {
      const dto = {
        recipientProfileId: 'recipient-uuid',
        amount: 2000,
        message: 'Great work!',
        fundingSource: C2cTipFundingSource.WALLET,
      };

      const mockResult = {
        tip: {
          id: 'tip-uuid',
          amount: 2000,
          source: TipSource.CUSTOMER_TO_CUSTOMER,
          tipStatus: TipStatus.COMPLETED,
          senderId: 'sender-uuid',
          recipientType: 'customer',
          fundingSource: C2cTipFundingSource.WALLET,
        },
      };

      mockCustomerTipsService.sendTip.mockResolvedValue(mockResult);

      const result = await controller.sendTip(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockResult);
      expect(mockCustomerTipsService.sendTip).toHaveBeenCalledWith(
        mockUser,
        dto,
        mockPaymentProvider,
      );
    });

    it('should send a card-funded tip and return authorization URL', async () => {
      const dto = {
        recipientProfileId: 'recipient-uuid',
        amount: 5000,
        message: 'Awesome!',
        fundingSource: C2cTipFundingSource.CARD,
      };

      const mockResult = {
        tip: {
          id: 'tip-card-uuid',
          amount: 5000,
          source: TipSource.CUSTOMER_TO_CUSTOMER,
          tipStatus: TipStatus.PENDING,
          fundingSource: C2cTipFundingSource.CARD,
        },
        authorizationUrl: 'https://checkout.paystack.com/abc123',
        reference: 'TXT-1234567890-abcdef',
      };

      mockCustomerTipsService.sendTip.mockResolvedValue(mockResult);

      const result = await controller.sendTip(mockUser, dto);

      expect(result.status).toBe('success');
      expect(result.data.authorizationUrl).toBe('https://checkout.paystack.com/abc123');
      expect(result.data.reference).toBe('TXT-1234567890-abcdef');
      expect(mockCustomerTipsService.sendTip).toHaveBeenCalledWith(
        mockUser,
        dto,
        mockPaymentProvider,
      );
    });

    it('should propagate service errors', async () => {
      const dto = {
        recipientProfileId: 'recipient-uuid',
        amount: 1000,
        fundingSource: C2cTipFundingSource.WALLET,
      };

      mockCustomerTipsService.sendTip.mockRejectedValue(
        new Error('Recipient customer profile not found'),
      );

      await expect(controller.sendTip(mockUser, dto)).rejects.toThrow(
        'Recipient customer profile not found',
      );
    });
  });

  describe('GET /customer/tips/search', () => {
    it('should return matching customers', async () => {
      const mockResults = [
        { id: 'c1', displayName: 'John Doe', avatarUrl: null, email: 'john@example.com' },
        { id: 'c2', displayName: 'Jane Smith', avatarUrl: 'https://example.com/avatar.jpg', email: 'jane@example.com' },
      ];

      mockCustomerTipsService.searchCustomers.mockResolvedValue(mockResults);

      const result = await controller.searchCustomers(mockUser, { q: 'John', limit: 10 });

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].displayName).toBe('John Doe');
      expect(mockCustomerTipsService.searchCustomers).toHaveBeenCalledWith({
        q: 'John',
        limit: 10,
      });
    });

    it('should pass query DTO through when limit is omitted', async () => {
      mockCustomerTipsService.searchCustomers.mockResolvedValue([]);

      await controller.searchCustomers(mockUser, { q: 'Test' });

      expect(mockCustomerTipsService.searchCustomers).toHaveBeenCalledWith({
        q: 'Test',
      });
    });
  });

  describe('GET /customer/tips/history', () => {
    it('should return paginated tip history', async () => {
      const mockHistory = {
        sent: { items: [{ id: 'tip-1', amount: 1000 }], total: 1, page: 1, limit: 20 },
        received: { items: [{ id: 'tip-2', amount: 500 }], total: 1, page: 1, limit: 20 },
      };

      mockCustomerTipsService.getMyTipHistory.mockResolvedValue(mockHistory);

      const result = await controller.getMyTipHistory(mockUser, { page: 1, limit: 20 });

      expect(result.status).toBe('success');
      expect(result.data.sent.items).toHaveLength(1);
      expect(result.data.received.items).toHaveLength(1);
      expect(result.data.sent.total).toBe(1);
      expect(result.data.sent.page).toBe(1);
      expect(mockCustomerTipsService.getMyTipHistory).toHaveBeenCalledWith(
        mockUser,
        { page: 1, limit: 20 },
      );
    });

    it('should pass query params through to service', async () => {
      const emptyHistory = {
        sent: { items: [], total: 0, page: 1, limit: 20 },
        received: { items: [], total: 0, page: 1, limit: 20 },
      };
      mockCustomerTipsService.getMyTipHistory.mockResolvedValue(emptyHistory);

      await controller.getMyTipHistory(mockUser, { page: 2, limit: 50 });

      expect(mockCustomerTipsService.getMyTipHistory).toHaveBeenCalledWith(
        mockUser,
        { page: 2, limit: 50 },
      );
    });
  });
});
