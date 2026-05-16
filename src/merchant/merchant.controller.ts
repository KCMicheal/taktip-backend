import { Controller, Get, Put, Post, Param, Body, UseGuards, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiBody, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MerchantService } from './merchant.service';
import { InviteService } from './services/invite.service';
import { BusinessType } from '../common/enums/business-type.enum';
import { InviteStaffDto } from './dto/invite.dto';
import { swaggerEnumValues } from '../common/helpers/enum-helper';

class UpdateMerchantDto {
  @ApiPropertyOptional({ description: 'Business name' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Business type',
    enum: swaggerEnumValues(BusinessType),
    example: 'RESTAURANT',
  })
  businessType?: BusinessType;

  @ApiPropertyOptional({ description: 'Business address' })
  address?: string;

  @ApiPropertyOptional({ description: 'Business email' })
  email?: string;

  @ApiPropertyOptional({ description: 'Business phone number' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Business city' })
  city?: string;

  @ApiPropertyOptional({ description: 'Business state' })
  state?: string;

  @ApiPropertyOptional({ description: 'Business zip/postal code' })
  zip?: string;

  @ApiPropertyOptional({ description: 'Business country code', example: 'NG' })
  country?: string;

  @ApiPropertyOptional({ description: 'Business description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Business logo URL' })
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Business currency', example: 'NGN' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Business timezone', example: 'Africa/Lagos' })
  timezone?: string;
}

@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchant')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly inviteService: InviteService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user merchants' })
  async getMyMerchants(@CurrentUser() user: { sub: string }) {
    const merchants = await this.merchantService.getMerchantsByOwnerId(user.sub);
    return { status: 'success', data: merchants };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get merchant by ID' })
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantById(@Param('id', ParseUUIDPipe) id: string) {
    const merchant = await this.merchantService.getMerchantById(id);
    return { status: 'success', data: merchant };
  }

  @Get('shortCode/:code')
  @ApiOperation({ summary: 'Lookup merchant by short code' })
  @ApiParam({ name: 'code', description: 'Merchant short code (e.g., CODE123456-GR)' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantByShortCode(@Param('code') shortCode: string) {
    const merchant = await this.merchantService.getMerchantByShortCode(shortCode);
    return { status: 'success', data: merchant };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update merchant details' })
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this merchant' })
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
  async getMerchantsByOwner(@Param('ownerId', ParseUUIDPipe) ownerId: string) {
    const merchants = await this.merchantService.getMerchantsByOwnerId(ownerId);
    return { status: 'success', data: merchants };
  }

  @Post(':merchantId/invite')
  @ApiOperation({ summary: 'Invite a staff member to join the merchant' })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiBody({ type: InviteStaffDto })
  @ApiResponse({ status: 201, description: 'Invite sent successfully' })
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
  @ApiOperation({ summary: 'Get all invites for a merchant' })
  @ApiParam({ name: 'merchantId', description: 'Merchant UUID' })
  @ApiResponse({ status: 200, description: 'List of invites' })
  @ApiResponse({ status: 403, description: 'Not authorized to view invites for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchantInvites(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @CurrentUser() user: { sub: string },
  ) {
    // Get the merchant to check ownership
    const merchant = await this.merchantService.getMerchantById(merchantId);
    
    // Check if the current user owns this merchant or is admin
    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to view invites for this merchant');
    }

    const invites = await this.inviteService.getMerchantInvites(merchantId, user.sub);
    return { status: 'success', data: invites };
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
}