import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { TipsService } from './tips.service';
import { TipResponseDto } from './dto/tip-response.dto';
import { ErrorResponseDto } from '../auth/dto/response.dto';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';

@ApiTags('tips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TipsController {
  constructor(
    private readonly tipsService: TipsService,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
  ) {}

  /**
   * Resolve the staff profile ID from the authenticated user.
   * - If staffProfileId is provided, use it directly.
   * - If merchantId is provided, find the staff profile for that (user, merchant).
   * - If neither is provided and the user has exactly one profile, use it.
   * - If neither is provided and the user has multiple profiles, throw 400.
   */
  private async resolveStaffProfileId(
    userId: string,
    staffProfileId?: string,
    merchantId?: string,
  ): Promise<string> {
    if (staffProfileId) {
      return staffProfileId;
    }

    if (merchantId) {
      const profile = await this.staffProfileRepository.findOne({
        where: { userId, merchantId },
      });
      if (!profile) {
        throw new NotFoundException('Staff profile not found for this merchant');
      }
      return profile.id;
    }

    const profiles = await this.staffProfileRepository.find({
      where: { userId },
    });

    if (profiles.length === 0) {
      throw new NotFoundException('No staff profile found for this user');
    }

    if (profiles.length > 1) {
      throw new BadRequestException(
        'Multiple staff profiles found. Provide staffProfileId or merchantId to disambiguate.',
      );
    }

    return profiles[0].id;
  }

  /**
   * Resolve the merchant ID from the authenticated user.
   * - If merchantId is provided, use it directly.
   * - If not, find the first merchant owned by this user.
   */
  private async resolveMerchantId(
    userId: string,
    merchantId?: string,
  ): Promise<string> {
    if (merchantId) {
      // Verify the merchant belongs to the authenticated user
      const merchant = await this.merchantRepository.findOne({
        where: { id: merchantId },
      });
      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }
      if (merchant.ownerId !== userId) {
        throw new ForbiddenException('Not authorized to access this merchant');
      }
      return merchantId;
    }

    const merchant = await this.merchantRepository.findOne({
      where: { ownerId: userId },
    });

    if (!merchant) {
      throw new NotFoundException('No merchant found for this user');
    }

    return merchant.id;
  }

  // ───────── STAFF ENDPOINTS ─────────

  @Get('staff/tips')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Get tips for the authenticated staff member (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiQuery({ name: 'staffProfileId', required: false, description: 'Staff profile UUID (required if user has multiple profiles)' })
  @ApiQuery({ name: 'merchantId', required: false, description: 'Merchant UUID to disambiguate staff profile' })
  @ApiResponse({
    status: 200,
    description: 'Paginated tips list for the staff member',
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
              amount: { type: 'number', example: 500 },
              currency: { type: 'string', example: 'NGN' },
              message: { type: 'string', nullable: true, example: 'Great service!' },
              rating: { type: 'number', nullable: true, example: 5 },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required', type: ErrorResponseDto })
  async getStaffTips(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('staffProfileId') staffProfileId?: string,
    @Query('merchantId') merchantId?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    const resolvedProfileId = await this.resolveStaffProfileId(
      user.sub,
      staffProfileId,
      merchantId,
    );

    const data = await this.tipsService.findByStaff(
      resolvedProfileId,
      pageNum,
      limitNum,
    );
    return { status: 'success', data };
  }

  @Get('staff/tips/earnings')
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Get earnings summary for the authenticated staff member' })
  @ApiQuery({ name: 'startDate', required: false, example: '2024-01-01', description: 'Start date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, example: '2024-12-31', description: 'End date (ISO 8601)' })
  @ApiQuery({ name: 'staffProfileId', required: false, description: 'Staff profile UUID (required if user has multiple profiles)' })
  @ApiQuery({ name: 'merchantId', required: false, description: 'Merchant UUID to disambiguate staff profile' })
  @ApiResponse({
    status: 200,
    description: 'Earnings summary for the staff member',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            totalTips: { type: 'number', example: 15000 },
            totalTipsCount: { type: 'number', example: 42 },
            averageRating: { type: 'number', example: 4.5 },
            periodStart: { type: 'string', format: 'date', nullable: true },
            periodEnd: { type: 'string', format: 'date', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required', type: ErrorResponseDto })
  async getStaffEarnings(
    @CurrentUser() user: { sub: string },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('staffProfileId') staffProfileId?: string,
    @Query('merchantId') merchantId?: string,
  ) {
    const resolvedProfileId = await this.resolveStaffProfileId(
      user.sub,
      staffProfileId,
      merchantId,
    );

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const data = await this.tipsService.getStaffEarnings(
      resolvedProfileId,
      start,
      end,
    );
    return { status: 'success', data };
  }

  // ───────── MERCHANT ENDPOINTS ─────────

  @Get('merchant/staff/:staffId/tips')
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'View tips for a specific staff member' })
  @ApiParam({ name: 'staffId', description: 'Staff profile UUID' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'Paginated tips for the staff member',
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
                  amount: { type: 'number', example: 500 },
                  currency: { type: 'string', example: 'NGN' },
                  message: { type: 'string', nullable: true },
                  rating: { type: 'number', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number', example: 42 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required', type: ErrorResponseDto })
  async getStaffTipsByMerchant(
    @CurrentUser() user: { sub: string },
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    // Resolve the merchant for this user
    const merchantId = await this.resolveMerchantId(user.sub);

    // Verify the staff profile belongs to this merchant
    const staffProfile = await this.staffProfileRepository.findOne({
      where: { id: staffId, merchantId },
    });
    if (!staffProfile) {
      throw new NotFoundException('Staff profile not found for this merchant');
    }

    const data = await this.tipsService.findByStaff(
      staffId,
      pageNum,
      limitNum,
    );
    return { status: 'success', data };
  }
}
