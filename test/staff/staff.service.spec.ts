import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { StaffService } from '../../src/staff/staff.service';
import { StaffProfile } from '../../src/staff/entities/staff-profile.entity';
import { Role } from '../../src/auth/enums/role.enum';
import { UpdateSettingsDto } from '../../src/staff/dto/update-settings.dto';
import { PayoutMethodDto } from '../../src/staff/dto/payout-method.dto';

describe('StaffService', () => {
  let service: StaffService;
  let staffProfileRepository: Repository<StaffProfile>;

  const mockStaffProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockUser = {
    id: 'user-uuid',
    email: 'staff@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+2348000000000',
  };

  const mockMerchant = {
    id: 'merchant-uuid',
    name: 'Test Restaurant',
    shortCode: 'CODE123456-TR',
  };

  const createMockProfile = (overrides: Partial<StaffProfile> = {}) => {
    const profile = new StaffProfile();
    Object.assign(profile, {
      id: 'profile-uuid',
      userId: 'user-uuid',
      merchantId: 'merchant-uuid',
      displayName: 'John Doe',
      roleTag: 'waiter',
      isClockedIn: false,
      currentShiftId: null,
      payoutMethod: null,
      settings: null,
      user: mockUser,
      merchant: mockMerchant,
      ...overrides,
    });
    return profile;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: getRepositoryToken(StaffProfile),
          useValue: mockStaffProfileRepository,
        },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
    staffProfileRepository = module.get<Repository<StaffProfile>>(
      getRepositoryToken(StaffProfile),
    );

    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should return dashboard data for a valid staff user (single profile, no merchantId)', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);

      const result = await service.getDashboard('user-uuid', Role.STAFF);

      expect(result).toBeDefined();
      expect(result.profile.id).toBe('profile-uuid');
      expect(result.profile.displayName).toBe('John Doe');
      expect(result.profile.roleTag).toBe('waiter');
      expect(result.profile.isClockedIn).toBe(false);
      expect(result.user.email).toBe('staff@example.com');
      expect(result.merchant?.name).toBe('Test Restaurant');
      expect(mockStaffProfileRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
        relations: ['user', 'merchant'],
      });
    });

    it('should return dashboard data when merchantId is provided', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.getDashboard('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result).toBeDefined();
      expect(result.profile.id).toBe('profile-uuid');
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid', merchantId: 'merchant-uuid' },
        relations: ['user', 'merchant'],
      });
    });

    it('should return merchant as null for independent staff', async () => {
      const mockProfile = createMockProfile({
        merchantId: null,
        merchant: null,
      });
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);

      const result = await service.getDashboard('user-uuid', Role.STAFF);

      expect(result.merchant).toBeNull();
    });

    it('should throw ForbiddenException if user is not STAFF role', async () => {
      await expect(
        service.getDashboard('user-uuid', Role.MERCHANT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is CUSTOMER', async () => {
      await expect(
        service.getDashboard('user-uuid', Role.CUSTOMER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if staff profile not found', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([]);

      await expect(
        service.getDashboard('unknown-user', Role.STAFF),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if multiple profiles and no merchantId', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([
        createMockProfile({ id: 'profile-1', merchantId: 'merchant-a' }),
        createMockProfile({ id: 'profile-2', merchantId: 'merchant-b' }),
      ]);

      await expect(
        service.getDashboard('multi-profile-user', Role.STAFF),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSettings', () => {
    it('should return settings for a valid staff user (single profile, no merchantId)', async () => {
      const mockProfile = createMockProfile({
        settings: { notifications: { push: true } },
        payoutMethod: {
          accountNumber: '0123456789',
          bankCode: '058',
          bankName: 'GTBank',
        },
      });
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);

      const result = await service.getSettings('user-uuid', Role.STAFF);

      expect(result.profile.settings).toEqual({
        notifications: { push: true },
      });
      expect(result.profile.payoutMethod).toBeDefined();
      expect(result.profile.payoutMethod?.accountNumber).toBe('0123456789');
    });

    it('should return settings when merchantId is provided', async () => {
      const mockProfile = createMockProfile({
        settings: { notifications: { push: true } },
      });
      mockStaffProfileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.getSettings('user-uuid', Role.STAFF, 'merchant-uuid');

      expect(result.profile.settings).toEqual({
        notifications: { push: true },
      });
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid', merchantId: 'merchant-uuid' },
        relations: ['user', 'merchant'],
      });
    });

    it('should throw ForbiddenException for non-staff roles', async () => {
      await expect(
        service.getSettings('user-uuid', Role.ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if profile missing', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([]);

      await expect(
        service.getSettings('no-profile', Role.STAFF),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSettings', () => {
    it('should update display name and role tag', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockStaffProfileRepository.save.mockResolvedValue({
        ...mockProfile,
        displayName: 'John the Waiter',
        roleTag: 'senior waiter',
      });

      // After save, getSettings will be called internally — also uses find
      const updatedProfile = createMockProfile({
        displayName: 'John the Waiter',
        roleTag: 'senior waiter',
      });
      mockStaffProfileRepository.find.mockResolvedValue([updatedProfile]);

      const dto: UpdateSettingsDto = {
        displayName: 'John the Waiter',
        roleTag: 'senior waiter',
      };

      const result = await service.updateSettings(
        'user-uuid',
        Role.STAFF,
        dto,
      );

      expect(result.profile.displayName).toBe('John the Waiter');
      expect(result.profile.roleTag).toBe('senior waiter');
      expect(mockStaffProfileRepository.save).toHaveBeenCalled();
    });

    it('should update settings when merchantId is provided', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(mockProfile);
      mockStaffProfileRepository.save.mockResolvedValue({
        ...mockProfile,
        displayName: 'John Updated',
      });

      const updatedProfile = createMockProfile({
        displayName: 'John Updated',
      });
      // getSettings called internally — with merchantId so uses findOne
      mockStaffProfileRepository.findOne.mockResolvedValue(updatedProfile);

      const dto: UpdateSettingsDto = { displayName: 'John Updated' };

      const result = await service.updateSettings('user-uuid', Role.STAFF, dto, 'merchant-uuid');

      expect(result.profile.displayName).toBe('John Updated');
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid', merchantId: 'merchant-uuid' },
        relations: ['user', 'merchant'],
      });
    });

    it('should merge settings with existing settings', async () => {
      const mockProfile = createMockProfile({
        settings: { notifications: { email: true } },
      });
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockStaffProfileRepository.save.mockResolvedValue({
        ...mockProfile,
        settings: {
          notifications: { email: true },
          theme: 'dark',
        },
      });

      const updatedProfile = createMockProfile({
        settings: {
          notifications: { email: true },
          theme: 'dark',
        },
      });
      mockStaffProfileRepository.find.mockResolvedValue([updatedProfile]);

      const dto: UpdateSettingsDto = {
        settings: { theme: 'dark' },
      };

      const result = await service.updateSettings(
        'user-uuid',
        Role.STAFF,
        dto,
      );

      expect(result.profile.settings).toHaveProperty('theme', 'dark');
      expect(result.profile.settings).toHaveProperty('notifications');
    });

    it('should throw ForbiddenException for non-staff', async () => {
      await expect(
        service.updateSettings('user-uuid', Role.MERCHANT, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('savePayoutMethod', () => {
    it('should save payout method successfully', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockStaffProfileRepository.save.mockResolvedValue(mockProfile);

      const dto: PayoutMethodDto = {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
      };

      const result = await service.savePayoutMethod(
        'user-uuid',
        Role.STAFF,
        dto,
      );

      expect(result.message).toBe('Payout method saved successfully');
      expect(mockProfile.payoutMethod).toBeDefined();
      expect(mockProfile.payoutMethod?.accountNumber).toBe('0123456789');
      expect(mockProfile.payoutMethod?.bankCode).toBe('058');
      expect(mockStaffProfileRepository.save).toHaveBeenCalled();
    });

    it('should save payout method when merchantId is provided', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.findOne.mockResolvedValue(mockProfile);
      mockStaffProfileRepository.save.mockResolvedValue(mockProfile);

      const dto: PayoutMethodDto = {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
      };

      const result = await service.savePayoutMethod('user-uuid', Role.STAFF, dto, 'merchant-uuid');

      expect(result.message).toBe('Payout method saved successfully');
      expect(mockStaffProfileRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid', merchantId: 'merchant-uuid' },
        relations: ['user', 'merchant'],
      });
    });

    it('should include accountHolderName if provided', async () => {
      const mockProfile = createMockProfile();
      mockStaffProfileRepository.find.mockResolvedValue([mockProfile]);
      mockStaffProfileRepository.save.mockResolvedValue(mockProfile);

      const dto: PayoutMethodDto = {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
        accountHolderName: 'John H. Doe',
      };

      await service.savePayoutMethod('user-uuid', Role.STAFF, dto);

      expect(mockProfile.payoutMethod?.accountHolderName).toBe('John H. Doe');
    });

    it('should throw BadRequestException for invalid account number (too short)', async () => {
      const dto: PayoutMethodDto = {
        accountNumber: '12345',
        bankCode: '058',
        bankName: 'GTBank',
      };

      await expect(
        service.savePayoutMethod('user-uuid', Role.STAFF, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-numeric account number', async () => {
      const dto: PayoutMethodDto = {
        accountNumber: 'ABCDEFGHIJ',
        bankCode: '058',
        bankName: 'GTBank',
      };

      await expect(
        service.savePayoutMethod('user-uuid', Role.STAFF, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for non-staff', async () => {
      const dto: PayoutMethodDto = {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
      };

      await expect(
        service.savePayoutMethod('user-uuid', Role.ADMIN, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if profile missing', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([]);

      const dto: PayoutMethodDto = {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
      };

      await expect(
        service.savePayoutMethod('no-profile', Role.STAFF, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProfilesList', () => {
    it('should return all profiles for the user', async () => {
      const merchantA = { id: 'merchant-a', name: 'Restaurant A', shortCode: 'ABC' } as any;
      const merchantB = { id: 'merchant-b', name: 'Bar B', shortCode: 'DEF' } as any;

      mockStaffProfileRepository.find.mockResolvedValue([
        createMockProfile({
          id: 'profile-1',
          merchantId: 'merchant-a',
          roleTag: 'waiter',
          merchant: merchantA,
        }),
        createMockProfile({
          id: 'profile-2',
          merchantId: 'merchant-b',
          roleTag: 'bartender',
          merchant: merchantB,
        }),
      ]);

      const result = await service.getProfilesList('user-uuid', Role.STAFF);

      expect(result.profiles).toHaveLength(2);
      expect(result.profiles[0].merchantName).toBe('Restaurant A');
      expect(result.profiles[0].roleTag).toBe('waiter');
      expect(result.profiles[1].merchantName).toBe('Bar B');
      expect(result.profiles[1].roleTag).toBe('bartender');
    });

    it('should return empty list if user has no profiles', async () => {
      mockStaffProfileRepository.find.mockResolvedValue([]);

      const result = await service.getProfilesList('user-uuid', Role.STAFF);

      expect(result.profiles).toHaveLength(0);
    });

    it('should throw ForbiddenException for non-staff role', async () => {
      await expect(
        service.getProfilesList('user-uuid', Role.MERCHANT),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
