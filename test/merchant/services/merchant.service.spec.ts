import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MerchantService } from '../../../src/merchant/merchant.service';
import { Merchant } from '../../../src/merchant/entities/merchant.entity';
import { BusinessType } from '../../../src/common/enums/business-type.enum';

describe('MerchantService', () => {
  let service: MerchantService;
  let merchantRepository: jest.Mocked<Repository<Merchant>>;

  const mockMerchant: Partial<Merchant> = {
    id: 'merchant-uuid',
    name: 'Test Restaurant',
    shortCode: 'CODE123456-TR',
    businessType: BusinessType.RESTAURANT,
    address: '123 Test St',
    email: 'test@restaurant.com',
    phone: '+2341234567890',
    city: 'Lagos',
    state: 'Lagos',
    zip: '100001',
    country: 'NG',
    description: 'A test restaurant',
    logoUrl: 'https://example.com/logo.png',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    ownerId: 'owner-uuid',
  };

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ count: '3' }),
  };

  const mockManager = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    query: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantService,
        {
          provide: getRepositoryToken(Merchant),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            manager: mockManager,
          },
        },
      ],
    }).compile();

    service = module.get<MerchantService>(MerchantService);
    merchantRepository = module.get(getRepositoryToken(Merchant));

    jest.clearAllMocks();
  });

  describe('getMerchantSummary', () => {
    it('should return staffCount and zero placeholders for wallet/tips/subscriptions', async () => {
      merchantRepository.findOne.mockResolvedValue(mockMerchant as Merchant);

      const result = await service.getMerchantSummary('merchant-uuid');

      expect(result.staffCount).toBe(3);
      expect(result.walletBalance).toBe(0);
      expect(result.pendingTips).toBe(0);
      expect(result.activeSubscriptions).toBe(0);
      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockManager.query).toHaveBeenCalledWith(
        'SELECT balance FROM wallets WHERE "merchantId" = $1 LIMIT 1',
        ['merchant-uuid'],
      );
    });

    it('should throw NotFoundException if merchant not found', async () => {
      merchantRepository.findOne.mockResolvedValue(null);

      await expect(service.getMerchantSummary('invalid-uuid')).rejects.toThrow(NotFoundException);
      await expect(service.getMerchantSummary('invalid-uuid')).rejects.toThrow('Merchant not found');
    });
  });
});
