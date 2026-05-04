import { Controller, Get, Put, Param, Body, UseGuards, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MerchantService } from './merchant.service';
import { BusinessType } from '../common/enums/business-type.enum';

class UpdateMerchantDto {
  name?: string;
  businessType?: BusinessType;
  address?: string;
  description?: string;
  logoUrl?: string;
  currency?: string;
  timezone?: string;
}

@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('merchant')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

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
}