import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '../auth/enums/role.enum';
import { QrCodesService } from './qrcodes.service';
import { GenerateQrCodeDto } from './dto/generate-qrcode.dto';
import { ErrorResponseDto } from '../auth/dto/response.dto';
import { Merchant } from '../merchant/entities/merchant.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';

@ApiTags('qr-codes')
@Controller()
export class QrCodesController {
  constructor(
    private readonly qrCodesService: QrCodesService,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
  ) {}

  /**
   * Resolve the merchant ID from the authenticated user.
   */
  private async resolveMerchantId(userId: string): Promise<string> {
    const merchant = await this.merchantRepository.findOne({
      where: { ownerId: userId },
    });
    if (!merchant) {
      throw new NotFoundException('No merchant found for this user');
    }
    return merchant.id;
  }

  @Post('merchant/qrcodes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Generate a QR code for the merchant' })
  @ApiResponse({
    status: 201,
    description: 'QR code generated successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            qrCode: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
                shortCode: { type: 'string', example: 'a1b2c3d4' },
                isActive: { type: 'boolean', example: true },
                staffProfileId: { type: 'string', format: 'uuid', nullable: true },
              },
            },
            qrDataUrl: { type: 'string', example: 'data:image/png;base64,iVBORw0KGgo...' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input', schema: { type: 'object', properties: { message: { type: 'string' }, error: { type: 'string' }, statusCode: { type: 'number', example: 400 } } } })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required', type: ErrorResponseDto })
  async generate(
    @CurrentUser() user: { sub: string },
    @Body() dto: GenerateQrCodeDto,
  ) {
    const merchantId = await this.resolveMerchantId(user.sub);
    const result = await this.qrCodesService.generateQrCode(merchantId, dto);
    return { status: 'success', data: result };
  }

  @Get('merchant/qrcodes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'List all QR codes for the authenticated merchant' })
  @ApiResponse({
    status: 200,
    description: 'List of QR codes for the merchant',
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
              shortCode: { type: 'string', example: 'a1b2c3d4' },
              isActive: { type: 'boolean' },
              staffProfileId: { type: 'string', format: 'uuid', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required', type: ErrorResponseDto })
  async listMerchantQrCodes(@CurrentUser() user: { sub: string }) {
    const merchantId = await this.resolveMerchantId(user.sub);
    const data = await this.qrCodesService.findByMerchant(merchantId);
    return { status: 'success', data };
  }

  @Get('staff/qr-codes')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @ApiOperation({ summary: 'List QR codes accessible to the authenticated staff member' })
  @ApiResponse({
    status: 200,
    description: 'List of QR codes for the staff member (merchant-wide + personal)',
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
              shortCode: { type: 'string', example: 'a1b2c3d4' },
              isActive: { type: 'boolean' },
              staffProfileId: { type: 'string', format: 'uuid', nullable: true },
              merchantId: { type: 'string', format: 'uuid' },
              url: { type: 'string', example: 'https://app.taktip.com/tip/a1b2c3d4' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Staff role required', type: ErrorResponseDto })
  async listStaffQrCodes(@CurrentUser() user: { sub: string }) {
    const staffProfiles = await this.staffProfileRepository.find({
      where: { userId: user.sub },
    });

    if (staffProfiles.length === 0) {
      return { status: 'success', data: [] };
    }

    // Collect unique merchant IDs from all staff profiles
    const merchantIds = [...new Set(staffProfiles.map((p) => p.merchantId).filter(Boolean))] as string[];

    if (merchantIds.length === 0) {
      return { status: 'success', data: [] };
    }

    const staffProfileIds = staffProfiles.map((p) => p.id);

    // Fetch QR codes using the service method — merchant-wide + staff-linked
    const qrCodes = await this.qrCodesService.findByMerchantForStaff(merchantIds, staffProfileIds);

    return { status: 'success', data: qrCodes };
  }

  @Delete('merchant/qrcodes/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MERCHANT)
  @ApiOperation({ summary: 'Deactivate a QR code' })
  @ApiParam({ name: 'id', description: 'QR code UUID' })
  @ApiResponse({
    status: 200,
    description: 'QR code deactivated',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'QR code deactivated' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'QR code not found', type: ErrorResponseDto })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ) {
    const merchantId = await this.resolveMerchantId(user.sub);
    await this.qrCodesService.deactivate(id, merchantId);
    return { status: 'success', message: 'QR code deactivated' };
  }

  @Get('tip/:shortCode')
  @Public()
  @ApiOperation({ summary: 'Resolve a QR code short code to tip page data' })
  @ApiParam({ name: 'shortCode', description: 'QR code short code (8 hex chars)' })
  @ApiResponse({
    status: 200,
    description: 'Tip page data resolved from short code',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            merchantId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
            staffProfileId: { type: 'string', format: 'uuid', nullable: true, example: '660e8400-e29b-41d4-a716-446655440001' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'QR code not found or inactive', type: ErrorResponseDto })
  async resolveQrCode(@Param('shortCode') shortCode: string) {
    const qrCode = await this.qrCodesService.findByShortCode(shortCode);

    if (!qrCode) {
      throw new NotFoundException('QR code not found or inactive');
    }

    const data: Record<string, unknown> = {
      merchantId: qrCode.merchantId,
    };

    if (qrCode.staffProfileId) {
      data.staffProfileId = qrCode.staffProfileId;
    }

    return { status: 'success', data };
  }
}
