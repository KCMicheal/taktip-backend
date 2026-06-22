import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminController } from '../../src/admin/admin.controller';
import { AdminService, DashboardStats } from '../../src/admin/admin.service';
import { MerchantService } from '../../src/merchant/merchant.service';
import { MerchantFilterDto } from '../../src/admin/dto/merchant-filter.dto';
import { UserFilterDto } from '../../src/admin/dto/user-filter.dto';
import { Role } from '../../src/auth/enums/role.enum';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    getDashboardStats: jest.fn(),
    findAllUsers: jest.fn(),
    deactivateUser: jest.fn(),
  };

  const mockMerchantService = {
    findAllAdmin: jest.fn(),
    getMerchantById: jest.fn(),
    getMerchantSummary: jest.fn(),
    approveMerchant: jest.fn(),
    suspendMerchant: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'admin-uuid', role: Role.ADMIN }),
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: MerchantService, useValue: mockMerchantService },
        { provide: JwtService, useValue: mockJwtService },
        Reflector,
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);

    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  //  Dashboard
  // ---------------------------------------------------------------------------

  describe('getDashboardStats', () => {
    it('should return dashboard KPIs', async () => {
      const expectedStats: DashboardStats = {
        totalMerchants: 42,
        totalUsers: 1250,
        customersCount: 800,
        merchantsCount: 100,
        staffCount: 300,
        adminsCount: 5,
        tipsToday: 156,
        tipsTodayVolume: 340000,
        pendingPayouts: 12,
        totalWalletBalance: 2500000,
      };
      mockAdminService.getDashboardStats.mockResolvedValue(expectedStats);

      const result = await controller.getDashboardStats();

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedStats);
    });
  });

  // ---------------------------------------------------------------------------
  //  Merchant Management
  // ---------------------------------------------------------------------------

  describe('getMerchants', () => {
    it('should return paginated merchant list with filters', async () => {
      const filters: MerchantFilterDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [{ id: 'merchant-1', name: 'Test Merchant' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockMerchantService.findAllAdmin.mockResolvedValue(expectedResult);

      const result = await controller.getMerchants(filters);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedResult);
      expect(mockMerchantService.findAllAdmin).toHaveBeenCalledWith(
        {
          status: undefined,
          kycStatus: undefined,
          search: undefined,
          dateFrom: undefined,
          dateTo: undefined,
        },
        1,
        20,
      );
    });

    it('should convert date strings to Date objects', async () => {
      const filters: MerchantFilterDto = {
        page: 1,
        limit: 20,
        dateFrom: '2026-01-01',
        dateTo: '2026-06-01',
      };
      mockMerchantService.findAllAdmin.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.getMerchants(filters);

      expect(mockMerchantService.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
        1,
        20,
      );
    });
  });

  describe('getMerchantById', () => {
    it('should return merchant details with summary', async () => {
      const mockMerchant = { id: 'merchant-uuid', name: 'Test Merchant', ownerId: 'owner-uuid' };
      const mockSummary = { staffCount: 5, walletBalance: 10000, pendingTips: 0, activeSubscriptions: 0 };

      mockMerchantService.getMerchantById.mockResolvedValue(mockMerchant as any);
      mockMerchantService.getMerchantSummary.mockResolvedValue(mockSummary);

      const result = await controller.getMerchantById('merchant-uuid');

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expect.objectContaining({
        id: 'merchant-uuid',
        name: 'Test Merchant',
        staffCount: 5,
        walletBalance: 10000,
      }));
    });
  });

  describe('approveMerchant', () => {
    it('should approve merchant KYC', async () => {
      const mockMerchant = { id: 'merchant-uuid', kycStatus: 2, status: 1 };
      const mockUser = { sub: 'admin-uuid' };

      mockMerchantService.approveMerchant.mockResolvedValue(mockMerchant as any);

      const result = await controller.approveMerchant('merchant-uuid', mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockMerchant);
      expect(mockMerchantService.approveMerchant).toHaveBeenCalledWith('merchant-uuid', 'admin-uuid');
    });
  });

  describe('suspendMerchant', () => {
    it('should suspend a merchant account', async () => {
      const mockMerchant = { id: 'merchant-uuid', status: 4 };
      mockMerchantService.suspendMerchant.mockResolvedValue(mockMerchant as any);

      const result = await controller.suspendMerchant('merchant-uuid');

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockMerchant);
      expect(mockMerchantService.suspendMerchant).toHaveBeenCalledWith('merchant-uuid');
    });
  });

  // ---------------------------------------------------------------------------
  //  User Management
  // ---------------------------------------------------------------------------

  describe('getUsers', () => {
    it('should return paginated user list', async () => {
      const filters: UserFilterDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [{ id: 'user-1', email: 'user@example.com', role: 2 }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockAdminService.findAllUsers.mockResolvedValue(expectedResult);

      const result = await controller.getUsers(filters);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedResult);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate a user account', async () => {
      const mockUser = { id: 'user-uuid', isActive: false };
      mockAdminService.deactivateUser.mockResolvedValue(mockUser as any);

      const result = await controller.deactivateUser('user-uuid');

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockUser);
      expect(mockAdminService.deactivateUser).toHaveBeenCalledWith('user-uuid', true);
    });
  });
});
