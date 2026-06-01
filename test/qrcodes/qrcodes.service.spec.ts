import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QrCodesService } from '../../src/qrcodes/qrcodes.service';
import { QrCode } from '../../src/qrcodes/entities/qrcode.entity';

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
