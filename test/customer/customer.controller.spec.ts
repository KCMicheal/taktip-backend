import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NotFoundException } from '@nestjs/common';
import { CustomerController } from '../../src/customer/customer.controller';
import { CustomerService } from '../../src/customer/customer.service';
import { CustomerActivityService } from '../../src/customer/services/customer-activity.service';
import { Role } from '../../src/auth/enums/role.enum';

describe('CustomerController', () => {
  let controller: CustomerController;

  const mockUser = { sub: 'user-uuid', role: Role.CUSTOMER };

  // ── Mock CustomerService ──
  const mockCustomerService = {
    getByUserId: jest.fn(),
    updateProfile: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-uuid', role: Role.CUSTOMER }),
    signAsync: jest.fn(),
  };

  // ── Sample Profile ──
  const mockProfile = {
    id: 'profile-uuid',
    userId: 'user-uuid',
    displayName: 'Johnny',
    avatar: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-uuid',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+2348012345678',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        {
          provide: CustomerService,
          useValue: mockCustomerService,
        },
        {
          provide: CustomerActivityService,
          useValue: {
            getActivity: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
          },
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn().mockReturnValue([Role.CUSTOMER]),
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: 'CUSTOM_JWT_SERVICE',
          useValue: mockJwtService,
        },
      ],
    }).compile();

    controller = module.get<CustomerController>(CustomerController);

    jest.clearAllMocks();
  });

  describe('GET /customer/profile', () => {
    it('should return the customer profile', async () => {
      mockCustomerService.getByUserId.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(mockUser);

      expect(result).toEqual({
        status: 'success',
        data: {
          id: 'profile-uuid',
          displayName: 'Johnny',
          avatar: null,
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+2348012345678',
          isTwoFactorEnabled: undefined,
          notificationPreferences: undefined,
          preferences: undefined,
          paymentMethods: undefined,
        },
      });
      expect(mockCustomerService.getByUserId).toHaveBeenCalledWith('user-uuid');
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      mockCustomerService.getByUserId.mockRejectedValue(
        new NotFoundException('Customer profile not found. Please register as a customer first.'),
      );

      await expect(controller.getProfile(mockUser)).rejects.toThrow(NotFoundException);
      expect(mockCustomerService.getByUserId).toHaveBeenCalledWith('user-uuid');
    });

    it('should handle avatar being set', async () => {
      const profileWithAvatar = {
        ...mockProfile,
        avatar: 'data:image/png;base64,iVBORw0KGgo...',
      };
      mockCustomerService.getByUserId.mockResolvedValue(profileWithAvatar);

      const result = await controller.getProfile(mockUser);

      expect(result.status).toBe('success');
      expect(result.data.avatar).toBe('data:image/png;base64,iVBORw0KGgo...');
    });
  });

  describe('PUT /customer/profile', () => {
    it('should update displayName successfully', async () => {
      const updatedProfile = {
        ...mockProfile,
        displayName: 'NewName',
      };
      mockCustomerService.updateProfile.mockResolvedValue(updatedProfile);

      const result = await controller.updateProfile(mockUser, { displayName: 'NewName' });

      expect(result).toEqual({
        status: 'success',
        data: {
          id: 'profile-uuid',
          displayName: 'NewName',
          avatar: null,
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+2348012345678',
        },
      });
      expect(mockCustomerService.updateProfile).toHaveBeenCalledWith('user-uuid', {
        displayName: 'NewName',
      });
    });

    it('should update avatar successfully', async () => {
      const updatedProfile = {
        ...mockProfile,
        avatar: 'data:image/webp;base64,UklGRkZGAAB...',
      };
      mockCustomerService.updateProfile.mockResolvedValue(updatedProfile);

      const result = await controller.updateProfile(mockUser, {
        avatar: 'data:image/webp;base64,UklGRkZGAAB...',
      });

      expect(result.status).toBe('success');
      expect(result.data.avatar).toBe('data:image/webp;base64,UklGRkZGAAB...');
      expect(mockCustomerService.updateProfile).toHaveBeenCalledWith('user-uuid', {
        avatar: 'data:image/webp;base64,UklGRkZGAAB...',
      });
    });

    it('should update both displayName and avatar', async () => {
      const updatedProfile = {
        ...mockProfile,
        displayName: 'Updated',
        avatar: 'data:image/png;base64,abc123',
      };
      mockCustomerService.updateProfile.mockResolvedValue(updatedProfile);

      const result = await controller.updateProfile(mockUser, {
        displayName: 'Updated',
        avatar: 'data:image/png;base64,abc123',
      });

      expect(result.data.displayName).toBe('Updated');
      expect(result.data.avatar).toBe('data:image/png;base64,abc123');
      expect(mockCustomerService.updateProfile).toHaveBeenCalledWith('user-uuid', {
        displayName: 'Updated',
        avatar: 'data:image/png;base64,abc123',
      });
    });

    it('should propagate NotFoundException from service', async () => {
      mockCustomerService.updateProfile.mockRejectedValue(
        new NotFoundException('Customer profile not found'),
      );

      await expect(
        controller.updateProfile(mockUser, { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
