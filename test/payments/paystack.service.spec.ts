import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { PaystackService } from '../../src/payments/paystack.service';
import { Payment } from '../../src/payments/entities/payment.entity';
import { PaymentStatus } from '../../src/payments/enums/payment-status.enum';
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

describe('PaystackService', () => {
  let service: PaystackService;
  let paymentRepository: Repository<Payment>;
  let tipRepository: Repository<Tip>;
  let walletRepository: Repository<Wallet>;

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
      amount: 500,
      currency: 'NGN',
      paymentStatus: PaymentStatus.PENDING,
      metadata: null,
      paystackResponse: null,
      paidAt: null,
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
        PaystackService,
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
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PaystackService>(PaystackService);
    paymentRepository = module.get<Repository<Payment>>(getRepositoryToken(Payment));
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    walletRepository = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
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

      const result = await service.initializeTransaction({
        email: 'customer@example.com',
        amount: 500,
        reference: 'TXT-custom-ref',
        metadata: { source: 'guest_tip' },
      });

      expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc123');
      expect(result.reference).toBe('TXT-custom-ref');
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

      const result = await service.initializeTransaction({
        email: 'customer@example.com',
        amount: 1000,
      });

      expect(result.reference).toMatch(/^TXT-/);
    });
  });

  // ───────── verifyTransaction ─────────

  describe('verifyTransaction', () => {
    it('should return verified transaction details on success', async () => {
      mockVerify.mockResolvedValue({
        data: {
          status: 'success',
          amount: 50000, // in kobo
          metadata: { source: 'guest_tip' },
        },
      });

      const result = await service.verifyTransaction('TXT-valid-ref');

      expect(result.status).toBe(true);
      expect(result.amount).toBe(500); // 50000 / 100
      expect(mockVerify).toHaveBeenCalledWith({ reference: 'TXT-valid-ref' });
    });

    it('should return status false when Paystack reports failure', async () => {
      mockVerify.mockResolvedValue({
        data: {
          status: 'failed',
          amount: 50000,
          metadata: {},
        },
      });

      const result = await service.verifyTransaction('TXT-failed-ref');

      expect(result.status).toBe(false);
    });
  });

  // ───────── handleWebhook ─────────

  describe('handleWebhook', () => {
    it('should handle charge.success event', async () => {
      const handleChargeSuccessSpy = jest.spyOn(service as any, 'handleChargeSuccess');
      handleChargeSuccessSpy.mockResolvedValue(undefined);

      await service.handleWebhook('charge.success', { reference: 'TXT-ref' });

      expect(handleChargeSuccessSpy).toHaveBeenCalledWith({ reference: 'TXT-ref' });

      handleChargeSuccessSpy.mockRestore();
    });

    it('should handle charge.failed event', async () => {
      const handleChargeFailedSpy = jest.spyOn(service as any, 'handleChargeFailed');
      handleChargeFailedSpy.mockResolvedValue(undefined);

      await service.handleWebhook('charge.failed', { reference: 'TXT-ref' });

      expect(handleChargeFailedSpy).toHaveBeenCalledWith({ reference: 'TXT-ref' });

      handleChargeFailedSpy.mockRestore();
    });

    it('should ignore unknown events', async () => {
      await service.handleWebhook('unknown.event', {});

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

      await service.handleWebhook('charge.success', {
        reference: 'TXT-ref',
        status: 'success',
      });

      // Payment should be marked SUCCESS
      expect(payment.paymentStatus).toBe(PaymentStatus.SUCCESS);
      expect(payment.paidAt).toBeInstanceOf(Date);
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
        service.handleWebhook('charge.success', { reference: 'nonexistent' }),
      ).resolves.toBeUndefined();
    });

    it('should log warning when reference is missing', async () => {
      // Should not throw
      await expect(
        service.handleWebhook('charge.success', {}),
      ).resolves.toBeUndefined();
    });

    it('should log warning but not fail when tip is not found', async () => {
      const payment = createMockPayment({
        reference: 'TXT-ref',
        tipId: 'orphan-tip-id',
      });

      mockPaymentRepository.findOne.mockResolvedValue(payment);
      mockTipRepository.findOne.mockResolvedValue(null);

      // Should not throw
      await expect(
        service.handleWebhook('charge.success', { reference: 'TXT-ref' }),
      ).resolves.toBeUndefined();
    });
  });

  // ───────── handleChargeFailed (via webhook) ─────────

  describe('charge.failed processing', () => {
    it('should update payment to FAILED', async () => {
      const payment = createMockPayment({
        reference: 'TXT-ref',
        paymentStatus: PaymentStatus.PENDING,
      });

      mockPaymentRepository.findOne.mockResolvedValue(payment);

      await service.handleWebhook('charge.failed', { reference: 'TXT-ref' });

      expect(payment.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(mockPaymentRepository.save).toHaveBeenCalledWith(payment);
    });

    it('should log warning when payment is not found', async () => {
      mockPaymentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.handleWebhook('charge.failed', { reference: 'nonexistent' }),
      ).resolves.toBeUndefined();
    });

    it('should log warning when reference is missing', async () => {
      await expect(
        service.handleWebhook('charge.failed', {}),
      ).resolves.toBeUndefined();
    });
  });

  // ───────── verifyWebhookSignature ─────────

  describe('verifyWebhookSignature', () => {
    it('should return true for a valid signature', () => {
      const body = JSON.stringify({ event: 'charge.success', data: { reference: 'TXT-ref' } });
      const secret = 'whsec_mocked_secret';

      // Generate a valid HMAC-SHA256 hash
      const expectedHash = createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      const result = service.verifyWebhookSignature(expectedHash, body);

      expect(result).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const body = JSON.stringify({ event: 'charge.success' });

      const result = service.verifyWebhookSignature('invalid-signature', body);

      expect(result).toBe(false);
    });

    it('should return false when webhook secret is not configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'PAYSTACK_WEBHOOK_SECRET') return '';
        if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mocked_secret';
        return undefined;
      });

      const body = JSON.stringify({ event: 'charge.success' });

      const result = service.verifyWebhookSignature('some-signature', body);

      expect(result).toBe(false);
    });
  });
});
