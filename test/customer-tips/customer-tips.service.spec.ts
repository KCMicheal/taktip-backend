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
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { Merchant } from '../../src/merchant/entities/merchant.entity';
import { Payment } from '../../src/payments/entities/payment.entity';
import { Wallet } from '../../src/wallet/entities/wallet.entity';
import { User } from '../../src/auth/entities/user.entity';
import { TipSource } from '../../src/tips/enums/tip-source.enum';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { C2cTipFundingSource } from '../../src/tips/enums/c2c-tip-funding-source.enum';
import { C2cTipSenderType } from '../../src/tips/enums/c2c-tip-sender-type.enum';
import { Role } from '../../src/auth/enums/role.enum';
import { PaymentProvider } from '../../src/payments/providers/interfaces/payment-provider.interface';
import { PaginationService } from '../../src/common/pagination/pagination.service';

describe('CustomerTipsService', () => {
  let service: CustomerTipsService;
  let tipRepository: Record<string, jest.Mock>;
  let customerProfileRepository: Record<string, jest.Mock>;
  let staffProfileRepository: Record<string, jest.Mock>;
  let merchantRepository: Record<string, jest.Mock>;
  let paymentRepository: Record<string, jest.Mock>;
  let walletRepository: Record<string, jest.Mock>;
  let userRepository: Record<string, jest.Mock>;
  let customerService: Record<string, jest.Mock>;
  let walletService: Record<string, jest.Mock>;
  let configService: Record<string, jest.Mock>;
  let mailService: Record<string, jest.Mock>;
  let paginationService: Record<string, jest.Mock>;

  // ── Mock data ──

  const mockUser = { sub: 'sender-user-uuid', role: Role.CUSTOMER };

  const mockSenderProfile = {
    id: 'sender-profile-uuid',
    userId: 'sender-user-uuid',
    displayName: 'Alice',
    avatar: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRecipientProfile = {
    id: 'recipient-profile-uuid',
    userId: 'recipient-user-uuid',
    displayName: 'Bob',
    avatar: null,
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
      find: jest.fn().mockResolvedValue([]),
    };

    staffProfileRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    merchantRepository = {
      find: jest.fn().mockResolvedValue([]),
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

    paginationService = {
      paginate: jest.fn(),
      wrap: jest.fn(),
      getSkip: jest.fn().mockImplementation((page: number, limit: number) => (page - 1) * limit),
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
          provide: getRepositoryToken(StaffProfile),
          useValue: staffProfileRepository,
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: merchantRepository,
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
        {
          provide: PaginationService,
          useValue: paginationService,
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
            avatar: null,
            user: { email: 'john@example.com', firstName: 'John', lastName: 'Doe' },
          },
          {
            id: 'customer-2',
            displayName: null,
            avatar: null,
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
      expect(result[1].avatar).toBeNull();

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
    it('should return all tips merged into a single paginated list sorted by date', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const allTips = [
        { id: 'tip-3', staffProfileId: 'sender-profile-uuid', amount: 500, recipientType: 'customer' },
        { id: 'tip-1', senderId: 'sender-profile-uuid', amount: 1000, recipientType: 'customer' },
        { id: 'tip-2', senderId: 'sender-profile-uuid', amount: 2000, recipientType: 'customer' },
      ];

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([allTips, 3]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      paginationService.wrap.mockReturnValue({ items: allTips, total: 3, page: 1, limit: 20 });

      const result = await service.getMyTipHistory(mockUser, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);

      expect(tipRepository.createQueryBuilder).toHaveBeenCalledWith('tip');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('tip.createdAt', 'DESC');
      // Default direction=all should apply the OR condition
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('customerProfileId'),
        expect.any(Object),
      );
      expect(paginationService.wrap).toHaveBeenCalledTimes(1);
    });

    it('should filter by direction=sent', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      paginationService.wrap.mockReturnValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.getMyTipHistory(mockUser, { page: 1, limit: 20, direction: 'sent' as any });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('tip.customerProfileId'),
        expect.any(Object),
      );
    });

    it('should filter by direction=received', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      paginationService.wrap.mockReturnValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.getMyTipHistory(mockUser, { page: 1, limit: 20, direction: 'received' as any });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('tip.staffProfileId'),
        expect.any(Object),
      );
    });

    it('should filter by period', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      paginationService.wrap.mockReturnValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.getMyTipHistory(mockUser, { page: 1, limit: 20, period: 7 });

      // Should have called andWhere with cutoff date for period
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('createdAt'),
        expect.objectContaining({ cutoff: expect.any(Date) }),
      );
    });

    it('should filter by status=completed', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      paginationService.wrap.mockReturnValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.getMyTipHistory(mockUser, { page: 1, limit: 20, status: 'completed' as any });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('tip.tipStatus'),
        { tipStatus: 1 }, // TipStatus.COMPLETED = 1
      );
    });

    it('should handle pagination offset correctly', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      paginationService.wrap.mockReturnValue({ items: [], total: 0, page: 3, limit: 10 });

      await service.getMyTipHistory(mockUser, { page: 3, limit: 10 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20); // (3-1) * 10
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should enrich tips with names', async () => {
      customerService.getByUserId.mockResolvedValue(mockSenderProfile);

      const tips = [
        {
          id: 'tip-1',
          source: 1, // TipSource.STAFF
          staffProfileId: 'staff-uuid',
          customerProfileId: 'sender-profile-uuid',
          merchantId: 'merchant-uuid',
          amount: 1000,
          currency: 'NGN',
          createdAt: new Date(),
        },
      ];

      const mockQueryBuilder = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([tips, 1]),
      };

      tipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const enriched = [{
        id: 'tip-1',
        source: 1,
        amount: 1000,
        currency: 'NGN',
        senderName: 'Test Sender',
        recipientName: 'Test Staff',
        merchantName: 'Test Merchant',
      }];

      paginationService.wrap.mockReturnValue({ items: enriched, total: 1, page: 1, limit: 20 });

      const result = await service.getMyTipHistory(mockUser, { page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].senderName).toBeDefined();
      expect(result.items[0].recipientName).toBeDefined();
    });
  });
});
