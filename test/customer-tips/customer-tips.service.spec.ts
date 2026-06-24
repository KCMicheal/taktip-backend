import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import { TipSource } from '../../src/tips/enums/tip-source.enum';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { C2cTipFundingSource } from '../../src/tips/enums/c2c-tip-funding-source.enum';
import { C2cTipSenderType } from '../../src/tips/enums/c2c-tip-sender-type.enum';
import { Role } from '../../src/auth/enums/role.enum';
import { PaymentProvider } from '../../src/payments/providers/interfaces/payment-provider.interface';

describe('CustomerTipsService', () => {
  let service: CustomerTipsService;
  let tipRepository: Record<string, jest.Mock>;
  let customerProfileRepository: Record<string, jest.Mock>;
  let paymentRepository: Record<string, jest.Mock>;
  let walletRepository: Record<string, jest.Mock>;
  let userRepository: Record<string, jest.Mock>;
  let customerService: Record<string, jest.Mock>;
  let walletService: Record<string, jest.Mock>;
  let configService: Record<string, jest.Mock>;
  let mailService: Record<string, jest.Mock>;

  // ── Mock data ──

  const mockUser = { sub: 'sender-user-uuid', role: Role.CUSTOMER };

  const mockSenderProfile = {
    id: 'sender-profile-uuid',
    userId: 'sender-user-uuid',
    displayName: 'Alice',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRecipientProfile = {
    id: 'recipient-profile-uuid',
    userId: 'recipient-user-uuid',
    displayName: 'Bob',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSenderWallet = {
    id: 'sender-wallet-uuid',
    ownerId: 'sender-profile-uuid',
    ownerType: 'customer',
    balanceAvailable: 10000,
    balancePending: 0,
    currency: 'NGN',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRecipientWallet = {
    id: 'recipient-wallet-uuid',
    ownerId: 'recipient-profile-uuid',
    ownerType: 'customer',
    balanceAvailable: 5000,
    balancePending: 0,
    currency: 'NGN',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTipTransactions = {
    tipOutTx: { id: 'tx-out-uuid', type: 8, amount: 2000, fee: 100 },
    tipInTx: { id: 'tx-in-uuid', type: 9, amount: 1900, fee: 0 },
    feeTx: { id: 'tx-fee-uuid', type: 7, amount: 100, fee: 0 },
  };

  const mockSenderUser = {
    id: 'sender-user-uuid',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Wonder',
  };

  const mockPaymentProvider = {
    name: 'paystack',
    initializeTransaction: jest.fn(),
    verifyTransaction: jest.fn(),
    handleWebhook: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  };

  // ── Module setup ──

  beforeEach(async () => {
    // Default KYC query builder mock — returns null (no prior tips)
    const defaultQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(null),
    };

    // Reset all mocks
    tipRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(defaultQueryBuilder),
    };

    customerProfileRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    paymentRepository = {
      update: jest.fn(),
    };

    walletRepository = {};

    userRepository = {
      findOne: jest.fn(),
    };

    customerService = {
      getByUserId: jest.fn(),
    };

    walletService = {
      getOrCreateCustomerWallet: jest.fn(),
      tipFromBalance: jest.fn(),
    };

    configService = {};

    mailService = {
      sendTipReceivedEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerTipsService,
        {
          provide: getRepositoryToken(Tip),
          useValue: tipRepository,
        },
        {
          provide: getRepositoryToken(CustomerProfile),
          useValue: customerProfileRepository,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: paymentRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: walletRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: CustomerService,
          useValue: customerService,
        },
        {
          provide: WalletService,
          useValue: walletService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: MailService,
          useValue: mailService,
        },
      ],
    }).compile();

    service = module.get<CustomerTipsService>(CustomerTipsService);

    jest.clearAllMocks();
  });

  // ── Tests ──

  describe('sendTip()', () => {
    it('should send a wallet-funded C2C tip successfully', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(mockRecipientProfile);
      walletService.getOrCreateCustomerWallet
        .mockResolvedValueOnce(mockSenderWallet)
        .mockResolvedValueOnce(mockRecipientWallet);
      walletService.tipFromBalance.mockResolvedValue(mockTipTransactions);

      const createdTip = {
        id: 'tip-uuid',
        merchantId: 'sender-profile-uuid',
        staffProfileId: 'recipient-profile-uuid',
        customerProfileId: 'sender-profile-uuid',
        amount: 2000,
        currency: 'NGN',
        message: 'Great work!',
        source: TipSource.CUSTOMER_TO_CUSTOMER,
        tipStatus: TipStatus.COMPLETED,
        senderId: 'sender-profile-uuid',
        senderType: C2cTipSenderType.CUSTOMER,
        recipientType: 'customer',
        fundingSource: C2cTipFundingSource.WALLET,
        senderWalletId: 'sender-wallet-uuid',
        transactionId: 'tx-out-uuid',
      };
      tipRepository.create.mockReturnValue(createdTip);
      tipRepository.save.mockResolvedValue(createdTip);

      userRepository.findOne.mockResolvedValue(mockSenderUser);

      const dto = {
        recipientProfileId: 'recipient-profile-uuid',
        amount: 2000,
        message: 'Great work!',
        fundingSource: C2cTipFundingSource.WALLET,
      };

      const result = await service.sendTip(mockUser, dto);

      expect(result.tip).toBeDefined();
      expect(result.tip.tipStatus).toBe(TipStatus.COMPLETED);
      expect(result.tip.source).toBe(TipSource.CUSTOMER_TO_CUSTOMER);
      expect(result.tip.senderId).toBe('sender-profile-uuid');
      expect(result.tip.recipientType).toBe('customer');
      expect(result.tip.fundingSource).toBe(C2cTipFundingSource.WALLET);
      expect(result.authorizationUrl).toBeUndefined();

      // Verify the atomic transfer was initiated
      expect(walletService.tipFromBalance).toHaveBeenCalledWith(
        'sender-wallet-uuid',
        'recipient-wallet-uuid',
        2000,
      );
      // Verify tip record creation
      expect(tipRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2000,
          source: TipSource.CUSTOMER_TO_CUSTOMER,
          fundingSource: C2cTipFundingSource.WALLET,
        }),
      );
      expect(tipRepository.save).toHaveBeenCalledWith(createdTip);
    });

    it('should send a card-funded C2C tip and return authorization URL', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(mockRecipientProfile);

      const pendingTip = {
        id: 'tip-card-uuid',
        merchantId: 'sender-profile-uuid',
        staffProfileId: 'recipient-profile-uuid',
        customerProfileId: 'sender-profile-uuid',
        amount: 5000,
        currency: 'NGN',
        message: 'Awesome!',
        source: TipSource.CUSTOMER_TO_CUSTOMER,
        tipStatus: TipStatus.PENDING,
        senderId: 'sender-profile-uuid',
        senderType: C2cTipSenderType.CUSTOMER,
        recipientType: 'customer',
        fundingSource: C2cTipFundingSource.CARD,
        senderWalletId: null,
      };
      tipRepository.create.mockReturnValue(pendingTip);
      tipRepository.save.mockResolvedValue(pendingTip);

      userRepository.findOne.mockResolvedValue(mockSenderUser);

      mockPaymentProvider.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/abc123',
        reference: 'TXT-1234567890-abcdef',
        accessCode: 'abc123',
      });

      paymentRepository.update.mockResolvedValue({ affected: 1 });

      const dto = {
        recipientProfileId: 'recipient-profile-uuid',
        amount: 5000,
        message: 'Awesome!',
        fundingSource: C2cTipFundingSource.CARD,
      };

      const result = await service.sendTip(mockUser, dto, mockPaymentProvider as unknown as PaymentProvider);

      expect(result.tip).toBeDefined();
      expect(result.tip.tipStatus).toBe(TipStatus.PENDING);
      expect(result.tip.fundingSource).toBe(C2cTipFundingSource.CARD);
      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc123');
      expect(result.reference).toBe('TXT-1234567890-abcdef');

      expect(mockPaymentProvider.initializeTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'alice@example.com',
          amount: 5000,
          metadata: expect.objectContaining({
            tipId: 'tip-card-uuid',
            isCustomerToCustomer: true,
          }),
        }),
      );
      expect(paymentRepository.update).toHaveBeenCalledWith(
        { reference: 'TXT-1234567890-abcdef' },
        { tipId: 'tip-card-uuid' },
      );
    });

    it('should throw BadRequestException for self-tip', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const dto = {
        recipientProfileId: 'sender-profile-uuid', // same as sender
        amount: 1000,
        fundingSource: C2cTipFundingSource.WALLET,
      };

      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        'Cannot send a tip to yourself',
      );
    });

    it('should throw NotFoundException when recipient does not exist', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(null);

      const dto = {
        recipientProfileId: 'nonexistent-uuid',
        amount: 1000,
        fundingSource: C2cTipFundingSource.WALLET,
      };

      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        'Recipient customer profile not found',
      );
    });

    it('should throw BadRequestException for amount exceeding max', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(mockRecipientProfile);

      const dto = {
        recipientProfileId: 'recipient-profile-uuid',
        amount: 100000, // exceeds 50,000 max
        fundingSource: C2cTipFundingSource.WALLET,
      };

      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        'Tip amount cannot exceed 50000',
      );
    });

    it('should throw BadRequestException for zero amount', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(mockRecipientProfile);

      const dto = {
        recipientProfileId: 'recipient-profile-uuid',
        amount: 0,
        fundingSource: C2cTipFundingSource.WALLET,
      };

      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        'Tip amount must be greater than zero',
      );
    });

    it('should throw BadRequestException for invalid funding source', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(mockRecipientProfile);

      const dto = {
        recipientProfileId: 'recipient-profile-uuid',
        amount: 1000,
        fundingSource: 999 as C2cTipFundingSource, // invalid
      };

      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        'Invalid funding source',
      );
    });

    it('should throw BadRequestException for CARD when paymentProvider is not provided', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);
      customerProfileRepository.findOne.mockResolvedValue(mockRecipientProfile);

      const dto = {
        recipientProfileId: 'recipient-profile-uuid',
        amount: 1000,
        fundingSource: C2cTipFundingSource.CARD,
      };

      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendTip(mockUser, dto)).rejects.toThrow(
        'Card payment is not available',
      );
    });
  });

  describe('searchCustomers()', () => {
    it('should return matching customers by name', async () => {
      const mockQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'customer-1',
            displayName: 'John Doe',
            avatarUrl: null,
            user: { email: 'john@example.com', firstName: 'John', lastName: 'Doe' },
          },
          {
            id: 'customer-2',
            displayName: null,
            avatarUrl: 'https://avatar.example.com/jane',
            user: { email: 'jane@example.com', firstName: 'Jane', lastName: 'Smith' },
          },
        ]),
      };

      customerProfileRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.searchCustomers({ q: 'John', limit: 20 });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('customer-1');
      expect(result[0].displayName).toBe('John Doe');
      expect(result[0].email).toBe('john@example.com');
      expect(result[1].displayName).toBe('Jane Smith'); // fallback to firstName + lastName
      expect(result[1].avatarUrl).toBe('https://avatar.example.com/jane');

      expect(customerProfileRepository.createQueryBuilder).toHaveBeenCalledWith('cp');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('should use default limit of 20 when not provided', async () => {
      const mockQueryBuilder = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      customerProfileRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.searchCustomers({ q: 'Test', limit: undefined as any });

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
    });
  });

  describe('getMyTipHistory()', () => {
    it('should return paginated sent and received tips', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const sentTips = [
        { id: 'tip-1', senderId: 'sender-profile-uuid', amount: 1000, recipientType: 'customer' },
        { id: 'tip-2', senderId: 'sender-profile-uuid', amount: 2000, recipientType: 'customer' },
      ];
      const receivedTips = [
        { id: 'tip-3', staffProfileId: 'sender-profile-uuid', amount: 500, recipientType: 'customer' },
      ];

      tipRepository.findAndCount
        .mockResolvedValueOnce([sentTips, 2])   // sent
        .mockResolvedValueOnce([receivedTips, 1]); // received

      const result = await service.getMyTipHistory(mockUser, { page: 1, limit: 20 });

      expect(result.sent).toHaveLength(2);
      expect(result.received).toHaveLength(1);
      expect(result.totalSent).toBe(2);
      expect(result.totalReceived).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);

      expect(tipRepository.findAndCount).toHaveBeenCalledTimes(2);
      // First call: sent tips
      expect(tipRepository.findAndCount).toHaveBeenNthCalledWith(1, {
        where: { senderId: 'sender-profile-uuid', recipientType: 'customer' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
      // Second call: received tips
      expect(tipRepository.findAndCount).toHaveBeenNthCalledWith(2, {
        where: { staffProfileId: 'sender-profile-uuid', recipientType: 'customer' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should handle pagination offset correctly', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      tipRepository.findAndCount
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([[], 0]);

      await service.getMyTipHistory(mockUser, { page: 3, limit: 10 });

      expect(tipRepository.findAndCount).toHaveBeenNthCalledWith(1, {
        where: { senderId: 'sender-profile-uuid', recipientType: 'customer' },
        order: { createdAt: 'DESC' },
        skip: 20, // (3 - 1) * 10
        take: 10,
      });
    });
  });
});
