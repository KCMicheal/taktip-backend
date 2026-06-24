import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { ErrorResponseDto } from '../auth/dto/response.dto';
import { AdminService, DashboardStats, AnalyticsResponse } from './admin.service';
import { MerchantService } from '../merchant/merchant.service';
import { AuditService } from '../audit/audit.service';
import { SupportService } from '../support/support.service';
import { UpdateTicketDto } from '../support/dto/update-ticket.dto';
import { SupportTicketFilterDto } from '../support/dto/support-ticket-filter.dto';
import { MerchantFilterDto } from './dto/merchant-filter.dto';
import { AnalyticsFilterDto } from './dto/analytics-filter.dto';
import { AuditFilterDto } from './dto/audit-filter.dto';
import { UserFilterDto } from './dto/user-filter.dto';

/**
 * Generic success response wrapper.
 */
class SuccessResponseDto<T> {
  status: string;
  data: T;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly merchantService: MerchantService,
    private readonly auditService: AuditService,
    private readonly supportService: SupportService,
  ) {}

  // ---------------------------------------------------------------------------
  //  Dashboard
  // ---------------------------------------------------------------------------

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get platform-wide dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard KPIs',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            totalMerchants: { type: 'number', example: 42 },
            totalUsers: { type: 'number', example: 1250 },
            customersCount: { type: 'number', example: 800 },
            merchantsCount: { type: 'number', example: 100 },
            staffCount: { type: 'number', example: 300 },
            adminsCount: { type: 'number', example: 5 },
            tipsToday: { type: 'number', example: 156 },
            tipsTodayVolume: { type: 'number', example: 340000 },
            pendingPayouts: { type: 'number', example: 12 },
            totalWalletBalance: { type: 'number', example: 2500000 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Admin role required', type: ErrorResponseDto })
  async getDashboardStats(): Promise<SuccessResponseDto<DashboardStats>> {
    const stats = await this.adminService.getDashboardStats();
    return { status: 'success', data: stats };
  }

  // ---------------------------------------------------------------------------
  //  Analytics
  // ---------------------------------------------------------------------------

  @Get('analytics')
  @ApiOperation({ summary: 'Get platform analytics over a date range' })
  @ApiQuery({
    name: 'dateFrom',
    required: true,
    type: String,
    description: 'Start date (ISO 8601, inclusive)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'End date (ISO 8601, inclusive). Defaults to now.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregate analytics (tips, merchants, payouts, users)',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            period: {
              type: 'object',
              properties: {
                dateFrom: { type: 'string', format: 'date-time' },
                dateTo: { type: 'string', format: 'date-time' },
              },
            },
            tips: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                volume: { type: 'number' },
                dailyBreakdown: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string' },
                      count: { type: 'number' },
                      volume: { type: 'number' },
                    },
                  },
                },
              },
            },
            merchants: { type: 'object' },
            payouts: { type: 'object' },
            users: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'dateFrom is required', type: ErrorResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied: Admin role required', type: ErrorResponseDto })
  async getAnalytics(
    @Query() filters: AnalyticsFilterDto,
  ): Promise<SuccessResponseDto<AnalyticsResponse>> {
    const dateFrom = new Date(filters.dateFrom);
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();

    const data = await this.adminService.getAnalytics({ dateFrom, dateTo });
    return { status: 'success', data };
  }

  // ---------------------------------------------------------------------------
  //  Merchant Management
  // ---------------------------------------------------------------------------

  @Get('merchants')
  @ApiOperation({ summary: 'List all merchants (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, type: Number, description: 'Filter by entity status (1=ACTIVE, 2=INACTIVE, 3=PENDING, 4=SUSPENDED)' })
  @ApiQuery({ name: 'kycStatus', required: false, type: Number, description: 'Filter by KYC status (1=PENDING, 2=APPROVED, 3=REJECTED)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name or owner email' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by creation date (ISO string, inclusive)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by creation date (ISO string, inclusive)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated merchant list',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object' } },
            total: { type: 'number', example: 42 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  async getMerchants(
    @Query() filters: MerchantFilterDto,
  ): Promise<SuccessResponseDto<unknown>> {
    const result = await this.merchantService.findAllAdmin(
      {
        status: filters.status,
        kycStatus: filters.kycStatus,
        search: filters.search,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
      filters.page,
      filters.limit,
    );
    return { status: 'success', data: result };
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: 'Get merchant details with staff count and wallet summary' })
  @ApiResponse({ status: 200, description: 'Merchant details' })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async getMerchantById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SuccessResponseDto<unknown>> {
    const merchant = await this.merchantService.getMerchantById(id);
    const summary = await this.merchantService.getMerchantSummary(id);
    return {
      status: 'success',
      data: { ...merchant, ...summary },
    };
  }

  @Patch('merchants/:id/approve')
  @ApiOperation({ summary: 'Approve merchant KYC and activate account' })
  @ApiResponse({ status: 200, description: 'Merchant approved successfully' })
  @ApiResponse({ status: 400, description: 'Merchant KYC is already approved', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async approveMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<unknown>> {
    const merchant = await this.merchantService.approveMerchant(id, user.sub);
    await this.auditService.log({
      adminId: user.sub,
      action: 'MERCHANT_APPROVE',
      entityType: 'merchant',
      entityId: id,
    });
    return { status: 'success', data: merchant };
  }

  @Patch('merchants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a merchant account' })
  @ApiResponse({ status: 200, description: 'Merchant suspended successfully' })
  @ApiResponse({ status: 400, description: 'Merchant is already suspended', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async suspendMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<unknown>> {
    const merchant = await this.merchantService.suspendMerchant(id);
    await this.auditService.log({
      adminId: user.sub,
      action: 'MERCHANT_SUSPEND',
      entityType: 'merchant',
      entityId: id,
    });
    return { status: 'success', data: merchant };
  }

  // ---------------------------------------------------------------------------
  //  User Management
  // ---------------------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'List all users (paginated, filterable by role)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({ name: 'role', required: false, type: Number, description: 'Filter by role (1=CUSTOMER, 2=MERCHANT, 3=STAFF, 4=ADMIN)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by email, first name, or last name' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by creation date (ISO string, inclusive)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by creation date (ISO string, inclusive)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object' } },
            total: { type: 'number', example: 1250 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  async getUsers(
    @Query() filters: UserFilterDto,
  ): Promise<SuccessResponseDto<unknown>> {
    const result = await this.adminService.findAllUsers(
      {
        role: filters.role,
        search: filters.search,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
      filters.page,
      filters.limit,
    );
    return { status: 'success', data: result };
  }

  @Patch('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user account' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponseDto })
  async deactivateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<unknown>> {
    const deactivatedUser = await this.adminService.deactivateUser(id, true);
    await this.auditService.log({
      adminId: user.sub,
      action: 'USER_DEACTIVATE',
      entityType: 'user',
      entityId: id,
    });
    return { status: 'success', data: deactivatedUser };
  }

  // ---------------------------------------------------------------------------
  //  Audit Log
  // ---------------------------------------------------------------------------

  @Get('audit-log')
  @ApiOperation({ summary: 'Get audit trail (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({ name: 'action', required: false, type: String, description: 'Filter by action (e.g., MERCHANT_APPROVE, MERCHANT_SUSPEND, USER_DEACTIVATE)' })
  @ApiQuery({ name: 'entityType', required: false, type: String, description: 'Filter by entity type (e.g., merchant, user)' })
  @ApiQuery({ name: 'entityId', required: false, type: String, description: 'Filter by entity UUID' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Start date (ISO string, inclusive)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'End date (ISO string, inclusive)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit log entries',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object' } },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Admin role required', type: ErrorResponseDto })
  async getAuditLog(
    @Query() filters: AuditFilterDto,
  ): Promise<SuccessResponseDto<unknown>> {
    const result = await this.auditService.findAll(
      {
        action: filters.action,
        entityType: filters.entityType,
        entityId: filters.entityId,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
      filters.page,
      filters.limit,
    );
    return { status: 'success', data: result };
  }

  // ---------------------------------------------------------------------------
  //  Support Tickets
  // ---------------------------------------------------------------------------

  @Get('support-tickets')
  @ApiOperation({ summary: 'List support tickets (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({ name: 'ticketStatus', required: false, type: Number, description: 'Filter by status (1=OPEN, 2=IN_PROGRESS, 3=RESOLVED, 4=CLOSED)' })
  @ApiQuery({ name: 'priority', required: false, type: Number, description: 'Filter by priority (1=LOW, 2=MEDIUM, 3=HIGH, 4=URGENT)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by subject or description' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by creation date (ISO string, inclusive)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by creation date (ISO string, inclusive)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated support ticket list',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object' } },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
  })
  async getSupportTickets(
    @Query() filters: SupportTicketFilterDto,
  ): Promise<SuccessResponseDto<unknown>> {
    const result = await this.supportService.findAll(
      {
        ticketStatus: filters.ticketStatus,
        priority: filters.priority,
        search: filters.search,
        dateFrom: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        dateTo: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
      filters.page,
      filters.limit,
    );
    return { status: 'success', data: result };
  }

  @Patch('support-tickets/:id')
  @ApiOperation({ summary: 'Update a support ticket (status, priority, assignment, notes)' })
  @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
  @ApiResponse({ status: 404, description: 'Ticket not found', type: ErrorResponseDto })
  async updateSupportTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: { sub: string },
  ): Promise<SuccessResponseDto<unknown>> {
    const ticket = await this.supportService.update(id, {
      ticketStatus: dto.ticketStatus,
      priority: dto.priority,
      assignedTo: dto.assignedTo,
      notes: dto.notes,
    });
    // Also log this action in the audit trail
    if (dto.ticketStatus !== undefined) {
      await this.auditService.log({
        adminId: user.sub,
        action: 'TICKET_UPDATE_STATUS',
        entityType: 'support_ticket',
        entityId: id,
        details: { ticketStatus: dto.ticketStatus },
      });
    }
    return { status: 'success', data: ticket };
  }
}
