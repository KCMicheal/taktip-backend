import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QrCodesService } from '../../src/qrcodes/qrcodes.service';
import { QrCode } from '../../src/qrcodes/entities/qrcode.entity';
import { Merchant } from '../../src/merchant/entities/merchant.entity';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { CustomerProfile } from '../../src/customer/entities/customer-profile.entity';

// Mock the `qrcode` library
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mocked-qr-image-data'),
}));

describe('QrCodesService', () => {
  let service: QrCodesService;
  let qrCodeRepository: Repository<QrCode>;

  const mockQrCodeRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockMerchantRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockCustomerProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'APP_URL') return 'https://app.taktip.com';
      return defaultValue;
    }),
  };

  const createMockQrCode = (overrides: Partial<QrCode> = {}): QrCode => {
    const qrCode = new QrCode();
    Object.assign(qrCode, {
      id: 'qr-uuid',
      merchantId: 'merchant-uuid',
      staffProfileId: null,
      customerProfileId: null,
      shortCode: 'a1b2c3d4',
      url: 'https://app.taktip.com/tip/a1b2c3d4',
      isActive: true,
      metadata: null,
      status: 'ACTIVE',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    });
    return qrCode;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrCodesService,
        {
          provide: getRepositoryToken(QrCode),
          useValue: mockQrCodeRepository,
        },
        {
          provide: getRepositoryToken(Merchant),
          useValue: mockMerchantRepository,
        },
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
        {
          provide: getRepositoryToken(CustomerProfile),
          useValue: mockCustomerProfileRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<QrCodesService>(QrCodesService);
    qrCodeRepository = module.get<Repository<QrCode>>(getRepositoryToken(QrCode));

    jest.clearAllMocks();
  });

  // ───────── generateShortCode ─────────

  describe('generateShortCode', () => {
    it('should generate a unique 8-character hex short code on first attempt', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);

      const shortCode = await service.generateShortCode();

      expect(shortCode).toMatch(/^[0-9a-f]{8}$/);
      expect(mockQrCodeRepository.findOne).toHaveBeenCalledTimes(1);
    });

    it('should retry on collision and succeed on second attempt', async () => {
      const existingQrCode = createMockQrCode({ shortCode: 'firsttry' });
      // First call returns an existing code (collision), second returns null (success)
      mockQrCodeRepository.findOne
        .mockResolvedValueOnce(existingQrCode)
        .mockResolvedValueOnce(null);

      const shortCode = await service.generateShortCode();

      expect(shortCode).toMatch(/^[0-9a-f]{8}$/);
      expect(mockQrCodeRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it('should throw ConflictException after max attempts', async () => {
      const existingQrCode = createMockQrCode({ shortCode: 'collision' });
      // All 10 attempts collide
      mockQrCodeRepository.findOne.mockResolvedValue(existingQrCode);

      await expect(service.generateShortCode()).rejects.toThrow(ConflictException);
      expect(mockQrCodeRepository.findOne).toHaveBeenCalledTimes(10);
    });
  });

  // ───────── generateQrCode ─────────

  describe('generateQrCode', () => {
    it('should generate a QR code for a merchant without staff link', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null); // No short code collision
      const createdQrCode = createMockQrCode({ merchantId: 'merchant-uuid' });
      mockQrCodeRepository.create.mockReturnValue(createdQrCode);
      mockQrCodeRepository.save.mockResolvedValue(createdQrCode);

      const result = await service.generateQrCode('merchant-uuid', {});

      expect(result.qrCode.merchantId).toBe('merchant-uuid');
      expect(result.qrCode.staffProfileId).toBeNull();
      expect(result.qrCode.isActive).toBe(true);
      expect(result.qrDataUrl).toBe('data:image/png;base64,mocked-qr-image-data');
      expect(result.qrCode.url).toMatch(/^https:\/\/app\.taktip\.com\/tip\//);
      expect(mockQrCodeRepository.create).toHaveBeenCalledTimes(1);
      expect(mockQrCodeRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should generate a QR code with staff profile link', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);
      const createdQrCode = createMockQrCode({
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-uuid',
        metadata: { tableNumber: 5 },
      });
      mockQrCodeRepository.create.mockReturnValue(createdQrCode);
      mockQrCodeRepository.save.mockResolvedValue(createdQrCode);

      const result = await service.generateQrCode('merchant-uuid', {
        staffProfileId: 'staff-uuid',
        metadata: { tableNumber: 5 },
      });

      expect(result.qrCode.staffProfileId).toBe('staff-uuid');
      expect(result.qrCode.isActive).toBe(true);
    });

    it('should use APP_URL from config', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'APP_URL') return 'https://custom.example.com';
        return undefined;
      });

      mockQrCodeRepository.findOne.mockResolvedValue(null);
      const createdQrCode = createMockQrCode({
        url: 'https://custom.example.com/tip/a1b2c3d4',
      });
      mockQrCodeRepository.create.mockReturnValue(createdQrCode);
      mockQrCodeRepository.save.mockResolvedValue(createdQrCode);

      const result = await service.generateQrCode('merchant-uuid', {});

      expect(result.qrCode.url).toContain('custom.example.com');
    });
  });

  // ───────── findByShortCode ─────────

  describe('findByShortCode', () => {
    it('should find an active QR code by short code', async () => {
      const mockQrCode = createMockQrCode({ shortCode: 'abc123', isActive: true });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);

      const result = await service.findByShortCode('abc123');

      expect(result).toEqual(mockQrCode);
      expect(mockQrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { shortCode: 'abc123', isActive: true },
      });
    });

    it('should return null for inactive or non-existent QR code', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);

      const result = await service.findByShortCode('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ───────── findByMerchant ─────────

  describe('findByMerchant', () => {
    it('should return all QR codes for a merchant ordered by creation date desc', async () => {
      const mockQrCodes = [
        createMockQrCode({ id: 'qr-1', createdAt: new Date('2024-02-01') }),
        createMockQrCode({ id: 'qr-2', createdAt: new Date('2024-01-01') }),
      ];
      mockQrCodeRepository.find.mockResolvedValue(mockQrCodes);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result).toHaveLength(2);
      expect(mockQrCodeRepository.find).toHaveBeenCalledWith({
        where: { merchantId: 'merchant-uuid' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array when merchant has no QR codes', async () => {
      mockQrCodeRepository.find.mockResolvedValue([]);

      const result = await service.findByMerchant('merchant-uuid');

      expect(result).toEqual([]);
    });
  });

  // ───────── ensureStaffQrCode ─────────

  describe('ensureStaffQrCode', () => {
    it('should skip creation if QR code already exists for staff profile', async () => {
      const existingQr = createMockQrCode({
        staffProfileId: 'staff-uuid',
        merchantId: 'merchant-uuid',
      });
      mockQrCodeRepository.findOne.mockResolvedValue(existingQr);

      await service.ensureStaffQrCode('staff-uuid', 'merchant-uuid');

      expect(mockQrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { staffProfileId: 'staff-uuid' },
      });
      expect(mockQrCodeRepository.create).not.toHaveBeenCalled();
      expect(mockQrCodeRepository.save).not.toHaveBeenCalled();
    });

    it('should create a QR code if none exists for the staff profile', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);
      mockQrCodeRepository.create.mockReturnValue(
        createMockQrCode({ staffProfileId: 'staff-uuid', merchantId: 'merchant-uuid' }),
      );
      mockQrCodeRepository.save.mockResolvedValue(
        createMockQrCode({ staffProfileId: 'staff-uuid', merchantId: 'merchant-uuid' }),
      );

      await service.ensureStaffQrCode('staff-uuid', 'merchant-uuid');

      expect(mockQrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { staffProfileId: 'staff-uuid' },
      });
      expect(mockQrCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant-uuid',
          staffProfileId: 'staff-uuid',
          isActive: true,
        }),
      );
      expect(mockQrCodeRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  // ───────── resolveByShortCode ─────────

  describe('resolveByShortCode', () => {
    it('should resolve a merchant QR code', async () => {
      const mockQrCode = createMockQrCode({ shortCode: 'abc123', staffProfileId: null, customerProfileId: null });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);
      mockMerchantRepository.findOne.mockResolvedValue({ id: 'merchant-uuid', name: "Joe's Restaurant", logoUrl: 'https://logo.url' });

      const result = await service.resolveByShortCode('abc123');

      expect(result).toEqual({
        qrCodeId: 'qr-uuid',
        merchantId: 'merchant-uuid',
        staffProfileId: null,
        customerProfileId: null,
        ownerName: "Joe's Restaurant",
        ownerPhoto: 'https://logo.url',
        ownerType: 'merchant',
      });
    });

    it('should resolve a staff QR code', async () => {
      const mockQrCode = createMockQrCode({ shortCode: 'abc123', staffProfileId: 'staff-uuid', customerProfileId: null });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);
      mockStaffProfileRepository.findOne.mockResolvedValue({
        id: 'staff-uuid',
        displayName: 'John',
        user: { firstName: 'John' },
      });

      const result = await service.resolveByShortCode('abc123');

      expect(result).toEqual({
        qrCodeId: 'qr-uuid',
        merchantId: 'merchant-uuid',
        staffProfileId: 'staff-uuid',
        customerProfileId: null,
        ownerName: 'John',
        ownerPhoto: null,
        ownerType: 'staff',
      });
    });

    it('should resolve a customer QR code', async () => {
      const mockQrCode = createMockQrCode({
        shortCode: 'abc123',
        staffProfileId: null,
        customerProfileId: 'customer-profile-uuid',
        merchantId: null,
      });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);
      mockCustomerProfileRepository.findOne.mockResolvedValue({
        id: 'customer-profile-uuid',
        displayName: 'Alice',
        avatar: 'data:image/png;base64,abc123',
        user: { firstName: 'Alice' },
      });

      const result = await service.resolveByShortCode('abc123');

      expect(result).toEqual({
        qrCodeId: 'qr-uuid',
        merchantId: null,
        staffProfileId: null,
        customerProfileId: 'customer-profile-uuid',
        ownerName: 'Alice',
        ownerPhoto: 'data:image/png;base64,abc123',
        ownerType: 'customer',
      });
    });

    it('should return null for inactive or non-existent QR code', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);

      const result = await service.resolveByShortCode('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ───────── ensureCustomerQrCode ─────────

  describe('ensureCustomerQrCode', () => {
    it('should skip creation and return existing if QR code already exists for customer', async () => {
      const existingQr = createMockQrCode({
        customerProfileId: 'customer-profile-uuid',
        merchantId: null,
      });
      mockQrCodeRepository.findOne.mockResolvedValue(existingQr);
      // toDataURL is already mocked at module level

      const result = await service.ensureCustomerQrCode('customer-profile-uuid');

      expect(result.qrCode.customerProfileId).toBe('customer-profile-uuid');
      expect(result.qrCode.merchantId).toBeNull();
      expect(result.qrDataUrl).toBe('data:image/png;base64,mocked-qr-image-data');
      expect(mockQrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { customerProfileId: 'customer-profile-uuid' },
      });
      expect(mockQrCodeRepository.create).not.toHaveBeenCalled();
      expect(mockQrCodeRepository.save).not.toHaveBeenCalled();
    });

    it('should create a QR code if none exists for the customer profile', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);
      const createdQr = createMockQrCode({
        customerProfileId: 'customer-profile-uuid',
        merchantId: null,
      });
      mockQrCodeRepository.create.mockReturnValue(createdQr);
      mockQrCodeRepository.save.mockResolvedValue(createdQr);

      const result = await service.ensureCustomerQrCode('customer-profile-uuid');

      expect(result.qrCode.customerProfileId).toBe('customer-profile-uuid');
      expect(result.qrCode.merchantId).toBeNull();
      expect(result.qrDataUrl).toBe('data:image/png;base64,mocked-qr-image-data');
      expect(mockQrCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerProfileId: 'customer-profile-uuid',
          isActive: true,
        }),
      );
      expect(mockQrCodeRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  // ───────── findByCustomerProfile ─────────

  describe('findByCustomerProfile', () => {
    it('should find a QR code by customer profile ID', async () => {
      const mockQrCode = createMockQrCode({ customerProfileId: 'customer-profile-uuid', merchantId: null });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);

      const result = await service.findByCustomerProfile('customer-profile-uuid');

      expect(result).toEqual(mockQrCode);
      expect(mockQrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { customerProfileId: 'customer-profile-uuid' },
      });
    });

    it('should return null when no QR code exists for the customer', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);

      const result = await service.findByCustomerProfile('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ───────── deactivateForCustomer ─────────

  describe('deactivateForCustomer', () => {
    it('should deactivate a QR code owned by the customer', async () => {
      const mockQrCode = createMockQrCode({
        id: 'customer-qr-id',
        customerProfileId: 'customer-profile-uuid',
        merchantId: null,
        isActive: true,
      });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);
      mockQrCodeRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.deactivateForCustomer('customer-qr-id', 'customer-profile-uuid');

      expect(mockQrCodeRepository.update).toHaveBeenCalledWith(
        'customer-qr-id',
        { isActive: false },
      );
    });

    it('should throw NotFoundException when QR code does not exist', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deactivateForCustomer('nonexistent', 'customer-profile-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when QR code belongs to another customer', async () => {
      const mockQrCode = createMockQrCode({
        id: 'other-customer-qr',
        customerProfileId: 'other-customer-profile-uuid',
        merchantId: null,
      });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);

      await expect(
        service.deactivateForCustomer('other-customer-qr', 'customer-profile-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────── deactivate ─────────

  describe('deactivate', () => {
    it('should deactivate an active QR code owned by the merchant', async () => {
      const mockQrCode = createMockQrCode({
        id: 'qr-to-deactivate',
        merchantId: 'merchant-uuid',
        isActive: true,
      });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);
      mockQrCodeRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.deactivate('qr-to-deactivate', 'merchant-uuid');

      expect(mockQrCodeRepository.update).toHaveBeenCalledWith(
        'qr-to-deactivate',
        { isActive: false },
      );
    });

    it('should throw NotFoundException when QR code does not exist', async () => {
      mockQrCodeRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deactivate('nonexistent', 'merchant-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when QR code belongs to another merchant', async () => {
      const mockQrCode = createMockQrCode({
        id: 'qr-other',
        merchantId: 'other-merchant',
      });
      mockQrCodeRepository.findOne.mockResolvedValue(mockQrCode);

      await expect(
        service.deactivate('qr-other', 'merchant-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
