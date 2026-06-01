import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { PaystackProvider } from '../../src/payments/providers/paystack/paystack.provider';
import { Payment } from '../../src/payments/entities/payment.entity';
import { PaymentStatus } from '../../src/payments/enums/payment-status.enum';
import { PaymentEventService } from '../../src/payments/payment-event.service';
import { PaymentEvent } from '../../src/payments/entities/payment-event.entity';
import { Tip } from '../../src/tips/entities/tip.entity';
import { TipStatus } from '../../src/tips/enums/tip-status.enum';
import { Wallet } from '../../src/wallet/entities/wallet.entity';

// Mock the paystack-api library
const mockInitialize = jest.fn();
const mockVerify = jest.fn();

jest.mock('paystack-api', () => {
  return jest.fn().mockImplementation(() => ({
    transaction: {
      initialize: mockInitialize,
      verify: mockVerify,
    },
  }));
});

describe('PaystackProvider', () => {
  let provider: PaystackProvider;
  let paymentRepository: Repository<Payment>;
  let tipRepository: Repository<Tip>;
  let walletRepository: Repository<Wallet>;
  let paymentEventService: PaymentEventService;

  const mockPaymentRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockTipRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
    manager: {
      query: jest.fn(),
      transaction: jest.fn(),
    },
  };

  const mockPaymentEventRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mocked_secret';
      if (key === 'PAYSTACK_WEBHOOK_SECRET') return 'whsec_mocked_secret';
      if (key === 'APP_URL') return 'https://app.taktip.com';
      return defaultValue;
    }),
  };

  const createMockPayment = (overrides: Partial<Payment> = {}): Payment => {
    const payment = new Payment();
    Object.assign(payment, {
      id: 'payment-uuid',
      tipId: null,
      reference: 'TXT-1712345678901-a1b2c3d4',
      provider: 'paystack',
      amount: 500,
      currency: 'NGN',
      paymentStatus: PaymentStatus.PENDING,
      metadata: null,
      providerResponse: null,
      paidAt: null,
      failureReason: null,
      channel: null,
      providerReference: null,
      refundedAt: null,
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    });
    return payment;
  };

  const createMockTip = (overrides: Partial<Tip> = {}): Tip => {
    const tip = new Tip();
    Object.assign(tip, {
      id: 'tip-uuid',
      merchantId: 'merchant-uuid',
      staffProfileId: 'staff-uuid',
      amount: 500,
      currency: 'NGN',
      source: 1, // GUEST
      tipStatus: TipStatus.PENDING,
      ...overrides,
    });
    return tip;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackProvider,
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepository,
        },
        {
          provide: getRepositoryToken(Tip),
          useValue: mockTipRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
        {
          provide: getRepositoryToken(PaymentEvent),
          useValue: mockPaymentEventRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        PaymentEventService,
      ],
    }).compile();

    provider = module.get<PaystackProvider>(PaystackProvider);
    paymentRepository = module.get<Repository<Payment>>(getRepositoryToken(Payment));
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    paymentEventService = module.get<PaymentEventService>(PaymentEventService);
  });

  // ───────── name ─────────

  describe('name', () => {
    it('should return "paystack"', () => {
      expect(provider.name).toBe('paystack');
    });
  });

  // ───────── initializeTransaction ─────────

  describe('initializeTransaction', () => {
    it('should initialize a Paystack transaction and create a PENDING payment record', async () => {
      mockInitialize.mockResolvedValue({
        data: {
          authorization_url: 'https://checkout.paystack.com/abc123',
          access_code: 'abc123',
        },
      });

      const createdPayment = createMockPayment({ reference: 'TXT-custom-ref' });
      mockPaymentRepository.create.mockReturnValue(createdPayment);
      mockPaymentRepository.save.mockResolvedValue(createdPayment);
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      const result = await provider.initializeTransaction({
        email: 'customer@example.com',
        amount: 500,
        reference: 'TXT-custom-ref',
        metadata: { source: 'guest_tip' },
      });

      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc123');
      expect(result.reference).toBe('TXT-custom-ref');
      expect(result.accessCode).toBe('abc123');
      expect(mockInitialize).toHaveBeenCalledWith({
        email: 'customer@example.com',
        amount: 50000, // 500 NGN * 100 = 50000 kobo
        reference: 'TXT-custom-ref',
        metadata: { source: 'guest_tip' },
        callback_url: 'https://app.taktip.com/tip/callback',
      });
      expect(mockPaymentRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should generate a reference when none is provided', async () => {
      mockInitialize.mockResolvedValue({
        data: {
          authorization_url: 'https://checkout.paystack.com/def456',
          access_code: 'def456',
        },
      });

      mockPaymentRepository.create.mockReturnValue(createMockPayment());
      mockPaymentRepository.save.mockResolvedValue(createMockPayment());
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      const result = await provider.initializeTransaction({
        email: 'customer@example.com',
        amount: 1000,
      });

      expect(result.reference).toMatch(/^TXT-/);
    });
  });

  // ───────── verifyTransaction ─────────

  describe('verifyTransaction', () => {
    it('should return verified transaction details on success', async () => {
      mockPaymentRepository.findOne.mockResolvedValue(createMockPayment());
      mockVerify.mockResolvedValue({
        data: {
          status: 'success',
          amount: 50000, // in kobo
          currency: 'NGN',
          gateway_response: 'Approved',
          paid_at: '2024-01-01T00:00:00.000Z',
          channel: 'card',
          metadata: { source: 'guest_tip' },
        },
      });
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      const result = await provider.verifyTransaction('TXT-valid-ref');

      expect(result.status).toBe(true);
      expect(result.amount).toBe(500); // 50000 / 100
      expect(result.currency).toBe('NGN');
      expect(result.channel).toBe('card');
      expect(result.gatewayResponse).toBe('Approved');
      expect(mockVerify).toHaveBeenCalledWith({ reference: 'TXT-valid-ref' });
    });

    it('should return status false when Paystack reports failure', async () => {
      mockPaymentRepository.findOne.mockResolvedValue(createMockPayment());
      mockVerify.mockResolvedValue({
        data: {
          status: 'failed',
          amount: 50000,
          currency: 'NGN',
          gateway_response: 'Declined',
          paid_at: null,
          channel: 'card',
          metadata: {},
        },
      });
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      const result = await provider.verifyTransaction('TXT-failed-ref');

      expect(result.status).toBe(false);
    });
  });

  // ───────── handleWebhook ─────────

  describe('handleWebhook', () => {
    it('should handle charge.success event', async () => {
      const handleChargeSuccessSpy = jest.spyOn(provider as any, 'handleChargeSuccess');
      handleChargeSuccessSpy.mockResolvedValue(undefined);

      await provider.handleWebhook('charge.success', { reference: 'TXT-ref' });

      expect(handleChargeSuccessSpy).toHaveBeenCalledWith({ reference: 'TXT-ref' });

      handleChargeSuccessSpy.mockRestore();
    });

    it('should handle charge.failed event', async () => {
      const handleChargeFailedSpy = jest.spyOn(provider as any, 'handleChargeFailed');
      handleChargeFailedSpy.mockResolvedValue(undefined);

      await provider.handleWebhook('charge.failed', { reference: 'TXT-ref' });

      expect(handleChargeFailedSpy).toHaveBeenCalledWith({ reference: 'TXT-ref' });

      handleChargeFailedSpy.mockRestore();
    });

    it('should ignore unknown events', async () => {
      await provider.handleWebhook('unknown.event', {});

      // No error thrown is the assertion
    });
  });

  // ───────── handleChargeSuccess (via webhook) ─────────

  describe('charge.success processing', () => {
    it('should update payment to SUCCESS and credit staff wallet when tip exists', async () => {
      const payment = createMockPayment({
        reference: 'TXT-ref',
        tipId: 'tip-uuid',
        paymentStatus: PaymentStatus.PENDING,
      });
      const tip = createMockTip({
        id: 'tip-uuid',
        staffProfileId: 'staff-uuid',
        amount: 500,
        tipStatus: TipStatus.PENDING,
      });

      mockPaymentRepository.findOne.mockResolvedValue(payment);
      mockTipRepository.findOne.mockResolvedValue(tip);
      mockWalletRepository.manager.query.mockResolvedValue([null, 1]);
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      await provider.handleWebhook('charge.success', {
        reference: 'TXT-ref',
        status: 'success',
        channel: 'card',
        paid_at: '2024-01-01T00:00:00.000Z',
      });

      // Payment should be marked SUCCESS
      expect(payment.paymentStatus).toBe(PaymentStatus.SUCCESS);
      expect(payment.paidAt).toBeInstanceOf(Date);
      expect(payment.channel).toBe('card');
      expect(mockPaymentRepository.save).toHaveBeenCalledWith(payment);

      // Tip should be marked COMPLETED
      expect(tip.tipStatus).toBe(TipStatus.COMPLETED);
      expect(mockTipRepository.save).toHaveBeenCalledWith(tip);

      // Wallet should be credited
      expect(mockWalletRepository.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "wallets" SET "balance_pending"'),
        [500, 'staff-uuid', 'staff'],
      );
    });

    it('should log warning when payment is not found', async () => {
      mockPaymentRepository.findOne.mockResolvedValue(null);

      // Should not throw
      await expect(
        provider.handleWebhook('charge.success', { reference: 'nonexistent' }),
      ).resolves.toBeUndefined();
    });

    it('should log warning when reference is missing', async () => {
      // Should not throw
      await expect(
        provider.handleWebhook('charge.success', {}),
      ).resolves.toBeUndefined();
    });

    it('should log warning but not fail when tip is not found', async () => {
      const payment = createMockPayment({
        reference: 'TXT-ref',
        tipId: 'orphan-tip-id',
      });

      mockPaymentRepository.findOne.mockResolvedValue(payment);
      mockTipRepository.findOne.mockResolvedValue(null);
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      // Should not throw
      await expect(
        provider.handleWebhook('charge.success', { reference: 'TXT-ref' }),
      ).resolves.toBeUndefined();
    });
  });

  // ───────── handleChargeFailed (via webhook) ─────────

  describe('charge.failed processing', () => {
    it('should update payment to FAILED and tip to FAILED when tip exists', async () => {
      const payment = createMockPayment({
        reference: 'TXT-ref',
        tipId: 'tip-uuid',
        paymentStatus: PaymentStatus.PENDING,
      });
      const tip = createMockTip({
        id: 'tip-uuid',
        tipStatus: TipStatus.PENDING,
      });

      mockPaymentRepository.findOne.mockResolvedValue(payment);
      mockTipRepository.findOne.mockResolvedValue(tip);
      mockPaymentEventRepository.create.mockReturnValue({});
      mockPaymentEventRepository.save.mockResolvedValue({});

      await provider.handleWebhook('charge.failed', {
        reference: 'TXT-ref',
        gateway_response: 'Insufficient funds',
      });

      expect(payment.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(payment.failureReason).toBe('Insufficient funds');
      expect(mockPaymentRepository.save).toHaveBeenCalledWith(payment);

      // Tip should also be marked FAILED
      expect(tip.tipStatus).toBe(TipStatus.FAILED);
      expect(mockTipRepository.save).toHaveBeenCalledWith(tip);
    });

    it('should log warning when payment is not found', async () => {
      mockPaymentRepository.findOne.mockResolvedValue(null);

      await expect(
        provider.handleWebhook('charge.failed', { reference: 'nonexistent' }),
      ).resolves.toBeUndefined();
    });

    it('should log warning when reference is missing', async () => {
      await expect(
        provider.handleWebhook('charge.failed', {}),
      ).resolves.toBeUndefined();
    });
  });

  // ───────── verifyWebhookSignature ─────────

  describe('verifyWebhookSignature', () => {
    // Reset the config mock to its default implementation before each test
    // to prevent test-ordering issues from mockImplementation overrides.
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mocked_secret';
        if (key === 'PAYSTACK_WEBHOOK_SECRET') return 'whsec_mocked_secret';
        if (key === 'APP_URL') return 'https://app.taktip.com';
        return defaultValue;
      });
    });

    it('should return true for a valid SHA512 signature', () => {
      const body = JSON.stringify({ event: 'charge.success', data: { reference: 'TXT-ref' } });
      const secret = 'whsec_mocked_secret';

      // Generate a valid HMAC-SHA512 hash
      const expectedHash = createHmac('sha512', secret)
        .update(body)
        .digest('hex');

      const result = provider.verifyWebhookSignature(expectedHash, body);

      expect(result).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const body = JSON.stringify({ event: 'charge.success' });

      const result = provider.verifyWebhookSignature('invalid-signature', body);

      expect(result).toBe(false);
    });

    it('should return false when webhook secret is not configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'PAYSTACK_WEBHOOK_SECRET') return '';
        if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mocked_secret';
        return undefined;
      });

      const body = JSON.stringify({ event: 'charge.success' });

      const result = provider.verifyWebhookSignature('some-signature', body);

      expect(result).toBe(false);
    });

    it('should use SHA512 algorithm (reject SHA256)', () => {
      const body = JSON.stringify({ event: 'charge.success', data: { reference: 'TXT-ref' } });
      const secret = 'whsec_mocked_secret';

      // SHA512 hash
      const sha512Hash = createHmac('sha512', secret)
        .update(body)
        .digest('hex');

      // SHA256 hash (should not match — proves we use SHA512)
      const sha256Hash = createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      const resultWithSha512 = provider.verifyWebhookSignature(sha512Hash, body);
      const resultWithSha256 = provider.verifyWebhookSignature(sha256Hash, body);

      expect(resultWithSha512).toBe(true);
      expect(resultWithSha256).toBe(false);
    });
  });
});
