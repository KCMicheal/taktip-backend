import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { StaffController } from '../../src/staff/staff.controller';
import { StaffService } from '../../src/staff/staff.service';
import { Role } from '../../src/auth/enums/role.enum';

describe('StaffController', () => {
  let controller: StaffController;
  let staffService: StaffService;

  const mockStaffService = {
    getDashboard: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    savePayoutMethod: jest.fn(),
    getProfilesList: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-uuid', role: Role.STAFF }),
    signAsync: jest.fn(),
  };

  const mockUser = {
    sub: 'user-uuid',
    role: Role.STAFF,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        {
          provide: StaffService,
          useValue: mockStaffService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<StaffController>(StaffController);
    staffService = module.get<StaffService>(StaffService);

    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should return staff dashboard data (no merchantId)', async () => {
      const expectedData = {
        profile: {
          id: 'profile-uuid',
          displayName: 'John Doe',
          roleTag: 'waiter',
          isClockedIn: false,
          currentShiftId: null,
        },
        user: {
          id: 'user-uuid',
          email: 'staff@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: null,
        },
        merchant: {
          id: 'merchant-uuid',
          name: 'Test Restaurant',
          shortCode: 'CODE123-TR',
        },
      };

      mockStaffService.getDashboard.mockResolvedValue(expectedData);

      const result = await controller.getDashboard(mockUser, undefined);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockStaffService.getDashboard).toHaveBeenCalledWith(
        'user-uuid',
        Role.STAFF,
        undefined,
      );
    });

    it('should return dashboard data scoped to merchantId', async () => {
      mockStaffService.getDashboard.mockResolvedValue({ profile: {}, user: {}, merchant: {} });

      const result = await controller.getDashboard(mockUser, 'merchant-uuid');

      expect(mockStaffService.getDashboard).toHaveBeenCalledWith(
        'user-uuid',
        Role.STAFF,
        'merchant-uuid',
      );
    });
  });

  describe('getSettings', () => {
    it('should return staff settings (no merchantId)', async () => {
      const expectedData = {
        profile: {
          id: 'profile-uuid',
          displayName: 'John Doe',
          roleTag: 'waiter',
          isClockedIn: false,
          settings: { notifications: { push: true } },
          payoutMethod: null,
        },
        user: {
          id: 'user-uuid',
          email: 'staff@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: null,
        },
        merchant: {
          id: 'merchant-uuid',
          name: 'Test Restaurant',
          shortCode: 'CODE123-TR',
        },
      };

      mockStaffService.getSettings.mockResolvedValue(expectedData);

      const result = await controller.getSettings(mockUser, undefined);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockStaffService.getSettings).toHaveBeenCalledWith(
        'user-uuid',
        Role.STAFF,
        undefined,
      );
    });
  });

  describe('updateSettings', () => {
    it('should update settings and return updated data (no merchantId)', async () => {
      const dto = {
        displayName: 'John the Waiter',
      };

      const expectedData = {
        profile: {
          id: 'profile-uuid',
          displayName: 'John the Waiter',
          roleTag: 'waiter',
          isClockedIn: false,
          settings: null,
          payoutMethod: null,
        },
        user: {
          id: 'user-uuid',
          email: 'staff@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: null,
        },
        merchant: {
          id: 'merchant-uuid',
          name: 'Test Restaurant',
          shortCode: 'CODE123-TR',
        },
      };

      mockStaffService.updateSettings.mockResolvedValue(expectedData);

      const result = await controller.updateSettings(mockUser, dto, undefined);

      expect(result.status).toBe('success');
      expect(result.data.profile.displayName).toBe('John the Waiter');
      expect(mockStaffService.updateSettings).toHaveBeenCalledWith(
        'user-uuid',
        Role.STAFF,
        dto,
        undefined,
      );
    });
  });

  describe('savePayoutMethod', () => {
    it('should save payout method and return success message (no merchantId)', async () => {
      const dto = {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'GTBank',
      };

      mockStaffService.savePayoutMethod.mockResolvedValue({
        message: 'Payout method saved successfully',
      });

      const result = await controller.savePayoutMethod(mockUser, dto, undefined);

      expect(result.status).toBe('success');
      expect(result.message).toBe('Payout method saved successfully');
      expect(mockStaffService.savePayoutMethod).toHaveBeenCalledWith(
        'user-uuid',
        Role.STAFF,
        dto,
        undefined,
      );
    });
  });

  describe('getProfiles', () => {
    it('should return list of staff profiles', async () => {
      const expectedData = {
        profiles: [
          {
            profileId: 'profile-1',
            merchantId: 'merchant-a',
            merchantName: 'Restaurant A',
            merchantShortCode: 'ABC',
            roleTag: 'waiter',
            displayName: 'John Doe',
          },
        ],
      };

      mockStaffService.getProfilesList.mockResolvedValue(expectedData);

      const result = await controller.getProfiles(mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
      expect(mockStaffService.getProfilesList).toHaveBeenCalledWith(
        'user-uuid',
        Role.STAFF,
      );
    });
  });
});
