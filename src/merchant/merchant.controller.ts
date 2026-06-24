import { Controller, Get, Put, Post, Delete, Param, Body, Query, UseGuards, ParseUUIDPipe, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../auth/dto/response.dto';
import { Role } from '../auth/enums/role.enum';
import { MerchantService } from './merchant.service';
import { InviteService } from './services/invite.service';
import { InviteStaffDto } from './dto/invite.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { SearchablePaginationParamsDto, InvitePaginationParamsDto } from '../common/pagination';
import { TipsService } from '../tips/tips.service';

@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchant')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly inviteService: InviteService,
    private readonly tipsService: TipsService,
  ) {}

  @Get('tips')
  @UseGuards(RolesGuard)
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Get all tips for the authenticated merchant (paginated, with staff names)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({ name: 'merchantId', required: false, description: 'Merchant UUID (resolved from user if omitted)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated tips list with staff names',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            tips: {
              type: 'array',
              items: { $ref: '#/components/schemas/TipResponseDto' },
            },
            total: { type: 'number', example: 42 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required', type: ErrorResponseDto })
  async getMerchantTips(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('merchantId') merchantId?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    // Resolve the merchant ID: either the provided one or the user's first merchant
    let resolvedMerchantId: string;
    if (merchantId) {
      const merchant = await this.merchantService.getMerchantById(merchantId);
      if (merchant.ownerId !== user.sub) {
        throw new ForbiddenException('Not authorized to access this merchant');
      }
      resolvedMerchantId = merchantId;
    } else {
      const merchants = await this.merchantService.getMerchantsByOwnerId(user.sub);
      if (!merchants.length) {
        throw new NotFoundException('No merchant found for this user');
      }
      resolvedMerchantId = merchants[0].id;
    }

    const data = await this.tipsService.findByMerchant(
      resolvedMerchantId,
      pageNum,
      limitNum,
    );
    return { status: 'success', data };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user merchants' })
  @ApiResponse({
    status: 200,
    description: 'List of merchants owned by the authenticated user',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              businessName: { type: 'string', example: "Joe's Restaurant" },
              businessType: { type: 'string', example: 'Restaurant' },
              shortCode: { type: 'string', example: 'CODE123456-GR' },
              isActive: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  })
  async getMyMerchants(@CurrentUser() user: { sub: string }) {
    const merchants = await this.merchantService.getMerchantsByOwnerId(user.sub);
    return { status: 'success', data: merchants };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get merchant by ID' })
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiResponse({
    status: 200,
    description: 'Merchant details',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            businessName: { type: 'string', example: "Joe's Restaurant" },
            businessType: { type: 'string', example: 'Restaurant' },
            shortCode: { type: 'string', example: 'CODE123456-GR' },
            isActive: { type: 'boolean', example: true },
            ownerId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantById(@Param('id', ParseUUIDPipe) id: string) {
    const merchant = await this.merchantService.getMerchantById(id);
    return { status: 'success', data: merchant };
  }

  @Get('shortCode/:code')
  @ApiOperation({ summary: 'Lookup merchant by short code' })
  @ApiParam({ name: 'code', description: 'Merchant short code (e.g., CODE123456-GR)' })
  @ApiResponse({
    status: 200,
    description: 'Merchant details for the short code',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            businessName: { type: 'string', example: "Joe's Restaurant" },
            businessType: { type: 'string', example: 'Restaurant' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantByShortCode(@Param('code') shortCode: string) {
    const merchant = await this.merchantService.getMerchantByShortCode(shortCode);
    return { status: 'success', data: merchant };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update merchant details' })
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiResponse({
    status: 200,
    description: 'Merchant updated successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            businessName: { type: 'string', example: "Joe's Restaurant" },
            businessType: { type: 'string', example: 'Restaurant' },
            shortCode: { type: 'string', example: 'CODE123456-GR' },
            isActive: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to update this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateMerchant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchantDto,
    @CurrentUser() user: { sub: string },
  ) {
    // Get the merchant first to check ownership
    const merchant = await this.merchantService.getMerchantById(id);
    
    // Check if the current user owns this merchant or is admin
    // Note: Add admin role check when admin functionality is implemented
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to update this merchant');
    }
    
    const updated = await this.merchantService.updateMerchant(id, dto);
    return { status: 'success', data: updated };
  }

  @Get('owner/:ownerId')
  @ApiOperation({ summary: 'Get all merchants for an owner' })
  @ApiParam({ name: 'ownerId', description: 'Owner user UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of merchants for the owner',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              businessName: { type: 'string', example: "Joe's Restaurant" },
              businessType: { type: 'string', example: 'Restaurant' },
              isActive: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid owner ID' })
  async getMerchantsByOwner(@Param('ownerId', ParseUUIDPipe) ownerId: string) {
    const merchants = await this.merchantService.getMerchantsByOwnerId(ownerId);
    return { status: 'success', data: merchants };
  }

  @Post(':merchantId/invite')
  @ApiOperation({ summary: 'Invite a staff member to join the merchant' })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiBody({ type: InviteStaffDto })
  @ApiResponse({
    status: 201,
    description: 'Invite sent successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'Invite sent successfully' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', example: 'staff@example.com' },
            token: { type: 'string', example: 'invite-token-abc123' },
            status: { type: 'string', example: 'PENDING' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to invite staff for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async inviteStaff(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: InviteStaffDto,
    @CurrentUser() user: { sub: string },
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);
    
    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to invite staff for this merchant');
    }

    const invite = await this.inviteService.inviteStaff(merchantId, dto, user.sub);
    return { status: 'success', data: invite, message: 'Invite sent successfully' };
  }

  @Get(':merchantId/invites')
  @ApiOperation({ summary: 'Get invites for a merchant (paginated, filterable)' })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'status', required: false, type: Number, description: 'Filter by status (1 = PENDING, 2 = ACCEPTED)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of invites for the merchant',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string', example: 'staff@example.com' },
                  status: { type: 'number', example: 1 },
                  token: { type: 'string', example: 'invite-token-abc123' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number', example: 15 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view invites for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantInvites(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
    @Query() params: InvitePaginationParamsDto,
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);
    
    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to view invites for this merchant');
    }

    const invites = await this.inviteService.getMerchantInvites(
      merchantId,
      user.sub,
      params.page,
      params.limit,
      params.status,
    );
    return { status: 'success', data: invites };
  }

  @Delete(':merchantId/invite/:inviteId')
  @UseGuards(RolesGuard)
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Cancel a pending invite (soft delete)' })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiParam({ name: 'inviteId', description: 'Invite UUID' })
  @ApiResponse({
    status: 200,
    description: 'Invite cancelled successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'Invite cancelled successfully' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to cancel this invite' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  async cancelInvite(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser() user: { sub: string },
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);

    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to cancel invites for this merchant');
    }

    await this.inviteService.cancelInvite(inviteId, user.sub);
    return { status: 'success', message: 'Invite cancelled successfully' };
  }

  @Get(':merchantId/summary')
  @ApiOperation({
    summary: 'Get merchant summary for account deletion check',
    description:
      'Returns staffCount, walletBalance, pendingTips, and activeSubscriptions. ' +
      'Used on the merchant Settings page to show requirements before account deletion.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiResponse({
    status: 200,
    description: 'Merchant summary data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            staffCount: { type: 'number', example: 5 },
            walletBalance: { type: 'number', example: 0, description: 'Phase B — Wallet module' },
            pendingTips: { type: 'number', example: 0, description: 'Phase C — Tipping module' },
            activeSubscriptions: { type: 'number', example: 0, description: 'Subscription module' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantSummary(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);

    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to view this merchant');
    }

    const summary = await this.merchantService.getMerchantSummary(merchantId);
    return { status: 'success', data: summary };
  }

  @Get(':merchantId/staff')
  @ApiOperation({
    summary: 'List staff under a merchant (paginated, searchable)',
    description:
      'Returns staff profiles belonging to a merchant, including ' +
      'basic user info (name, email, phone). Supports search and pagination. ' +
      'Only the merchant owner can access this.',
  })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name, email, or employeeCode (case-insensitive, partial match)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'clockedIn', required: false, type: Boolean, description: 'When true, only return staff who are currently clocked in' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of staff members',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  userId: { type: 'string', format: 'uuid' },
                  firstName: { type: 'string', example: 'John' },
                  lastName: { type: 'string', example: 'Doe' },
                  email: { type: 'string', example: 'staff@example.com' },
                  phone: { type: 'string', nullable: true, example: '+2348012345678' },
                  isActive: { type: 'boolean', example: true },
                  isClockedIn: { type: 'boolean', example: true },
                  employeeCode: { type: 'string', example: 'EMP-001', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number', example: 47 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized to view staff for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantStaff(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
    @Query() params: SearchablePaginationParamsDto,
    @Query('clockedIn') clockedIn?: string,
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);

    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to view staff for this merchant');
    }

    // Parse clockedIn query param: only apply filter when explicitly "true"
    const clockedInFilter = clockedIn === 'true' ? true : undefined;

    const staff = await this.merchantService.getMerchantStaff(
      merchantId,
      params.search,
      params.page,
      params.limit,
      clockedInFilter,
    );
    return { status: 'success', data: staff };
  }

  @Delete(':merchantId/staff/:staffId')
  @UseGuards(RolesGuard)
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Remove a staff member from the merchant (soft delete)' })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiParam({ name: 'staffId', description: 'Staff profile UUID' })
  @ApiResponse({
    status: 200,
    description: 'Staff removed successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'Staff removed successfully' },
        data: {
          type: 'object',
          properties: {
            walletBalance: { type: 'number', example: 0 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot remove a staff member who is currently clocked in' })
  @ApiResponse({ status: 403, description: 'Not authorized to remove staff for this merchant' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  async removeStaff(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @CurrentUser() user: { sub: string },
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);

    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to remove staff for this merchant');
    }

    const result = await this.merchantService.removeStaff(merchantId, staffId);
    return { status: 'success', message: 'Staff removed successfully', data: result };
  }
}