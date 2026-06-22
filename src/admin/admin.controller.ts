import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
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
import { AdminService, DashboardStats } from './admin.service';
import { MerchantService } from '../merchant/merchant.service';
import { MerchantFilterDto } from './dto/merchant-filter.dto';
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
    return { status: 'success', data: merchant };
  }

  @Patch('merchants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a merchant account' })
  @ApiResponse({ status: 200, description: 'Merchant suspended successfully' })
  @ApiResponse({ status: 400, description: 'Merchant is already suspended', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found', type: ErrorResponseDto })
  async suspendMerchant(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SuccessResponseDto<unknown>> {
    const merchant = await this.merchantService.suspendMerchant(id);
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
  ): Promise<SuccessResponseDto<unknown>> {
    const user = await this.adminService.deactivateUser(id, true);
    return { status: 'success', data: user };
  }
}
