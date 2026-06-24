import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminController } from '../../src/admin/admin.controller';
import { AdminService, DashboardStats } from '../../src/admin/admin.service';
import { MerchantService } from '../../src/merchant/merchant.service';
import { AuditService } from '../../src/audit/audit.service';
import { SupportService } from '../../src/support/support.service';
import { AnalyticsFilterDto } from '../../src/admin/dto/analytics-filter.dto';
import { AuditFilterDto } from '../../src/admin/dto/audit-filter.dto';
import { SupportTicketFilterDto } from '../../src/support/dto/support-ticket-filter.dto';
import { UpdateTicketDto } from '../../src/support/dto/update-ticket.dto';
import { MerchantFilterDto } from '../../src/admin/dto/merchant-filter.dto';
import { UserFilterDto } from '../../src/admin/dto/user-filter.dto';
import { Role } from '../../src/auth/enums/role.enum';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    getDashboardStats: jest.fn(),
    getAnalytics: jest.fn(),
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

  const mockAuditService = {
    log: jest.fn(),
    findAll: jest.fn(),
  };

  const mockSupportService = {
    findAll: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'admin-uuid', role: Role.ADMIN }),
    signAsync: jest.fn(),
  };

  const mockUser = { sub: 'admin-uuid' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: MerchantService, useValue: mockMerchantService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: SupportService, useValue: mockSupportService },
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
    it('should approve merchant KYC and log audit', async () => {
      const mockMerchant = { id: 'merchant-uuid', kycStatus: 2, status: 1 };

      mockMerchantService.approveMerchant.mockResolvedValue(mockMerchant as any);

      const result = await controller.approveMerchant('merchant-uuid', mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockMerchant);
      expect(mockMerchantService.approveMerchant).toHaveBeenCalledWith('merchant-uuid', 'admin-uuid');
      expect(mockAuditService.log).toHaveBeenCalledWith({
        adminId: 'admin-uuid',
        action: 'MERCHANT_APPROVE',
        entityType: 'merchant',
        entityId: 'merchant-uuid',
      });
    });
  });

  describe('suspendMerchant', () => {
    it('should suspend a merchant account', async () => {
      const mockMerchant = { id: 'merchant-uuid', status: 4 };
      mockMerchantService.suspendMerchant.mockResolvedValue(mockMerchant as any);

      const result = await controller.suspendMerchant('merchant-uuid', mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(mockMerchant);
      expect(mockMerchantService.suspendMerchant).toHaveBeenCalledWith('merchant-uuid');
      expect(mockAuditService.log).toHaveBeenCalledWith({
        adminId: 'admin-uuid',
        action: 'MERCHANT_SUSPEND',
        entityType: 'merchant',
        entityId: 'merchant-uuid',
      });
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
    it('should deactivate a user account and log audit', async () => {
      const deactivatedUser = { id: 'user-uuid', isActive: false };
      mockAdminService.deactivateUser.mockResolvedValue(deactivatedUser as any);

      const result = await controller.deactivateUser('user-uuid', mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(deactivatedUser);
      expect(mockAdminService.deactivateUser).toHaveBeenCalledWith('user-uuid', true);
      expect(mockAuditService.log).toHaveBeenCalledWith({
        adminId: 'admin-uuid',
        action: 'USER_DEACTIVATE',
        entityType: 'user',
        entityId: 'user-uuid',
      });
    });
  });

  // ---------------------------------------------------------------------------
  //  Analytics
  // ---------------------------------------------------------------------------

  describe('getAnalytics', () => {
    it('should return analytics data for a given date range', async () => {
      const filters: AnalyticsFilterDto = { page: 1, limit: 20, dateFrom: '2026-01-01T00:00:00.000Z' };
      const expectedData = {
        period: { dateFrom: '2026-01-01T00:00:00.000Z', dateTo: expect.any(String) },
        tips: { total: 100, volume: 50000, dailyBreakdown: [] },
        merchants: { newCount: 10, dailyBreakdown: [] },
        payouts: { total: 50, volume: 25000, dailyBreakdown: [] },
        users: { newCount: 200, byRole: [], dailyBreakdown: [] },
      };
      mockAdminService.getAnalytics.mockResolvedValue(expectedData);

      const result = await controller.getAnalytics(filters);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedData);
    });
  });

  // ---------------------------------------------------------------------------
  //  Audit Log
  // ---------------------------------------------------------------------------

  describe('getAuditLog', () => {
    it('should return paginated audit log entries', async () => {
      const filters: AuditFilterDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [{ id: 'audit-1', action: 'MERCHANT_APPROVE', entityType: 'merchant' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockAuditService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.getAuditLog(filters);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedResult);
    });
  });

  // ---------------------------------------------------------------------------
  //  Support Tickets
  // ---------------------------------------------------------------------------

  describe('getSupportTickets', () => {
    it('should return paginated support ticket list', async () => {
      const filters: SupportTicketFilterDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [{ id: 'ticket-1', subject: 'Test', ticketStatus: 1 }],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockSupportService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.getSupportTickets(filters);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedResult);
    });
  });

  describe('updateSupportTicket', () => {
    it('should update a support ticket and log audit', async () => {
      const dto: UpdateTicketDto = { ticketStatus: 2 };
      const expectedTicket = { id: 'ticket-1', subject: 'Test', ticketStatus: 2 };
      mockSupportService.update.mockResolvedValue(expectedTicket as any);

      const result = await controller.updateSupportTicket('ticket-1', dto, mockUser);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(expectedTicket);
      expect(mockAuditService.log).toHaveBeenCalledWith({
        adminId: 'admin-uuid',
        action: 'TICKET_UPDATE_STATUS',
        entityType: 'support_ticket',
        entityId: 'ticket-1',
        details: { ticketStatus: 2 },
      });
    });

    it('should not log audit when ticketStatus is not changed', async () => {
      const dto: UpdateTicketDto = { notes: 'Just adding a note' };
      const expectedTicket = { id: 'ticket-1', notes: 'Just adding a note' };
      mockSupportService.update.mockResolvedValue(expectedTicket as any);

      const result = await controller.updateSupportTicket('ticket-1', dto, mockUser);

      expect(result.status).toBe('success');
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });
});
