import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Inject,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CustomerTipsService } from './customer-tips.service';
import { SendCustomerTipDto, SearchCustomersQueryDto } from './dto/send-customer-tip.dto';
import { TipHistoryQueryDto } from './dto/tip-history-query.dto';
import { ExportTipsQueryDto } from './dto/export-tips-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { PAYMENT_PROVIDER } from '../payments/providers/providers.constants';
import { PaymentProvider } from '../payments/providers/interfaces/payment-provider.interface';

@ApiTags('Customer-to-Customer Tips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.ADMIN)
@Controller('customer/tips')
export class CustomerTipsController {
  constructor(
    private readonly customerTipsService: CustomerTipsService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  @Post('send')
  @ApiOperation({ summary: 'Send a C2C tip (wallet or card funded)' })
  @ApiResponse({
    status: 201,
    description: 'Tip sent or checkout URL returned for card-funded',
  })
  @ApiResponse({ status: 400, description: 'Validation error or self-tip' })
  @ApiResponse({ status: 404, description: 'Recipient not found' })
  async sendTip(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: SendCustomerTipDto,
  ) {
    const result = await this.customerTipsService.sendTip(
      user,
      dto,
      this.paymentProvider,
    );
    return { status: 'success', data: result };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search customers by name or email' })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max results (default: 20, max: 50)',
  })
  @ApiResponse({ status: 200, description: 'Matching customers' })
  async searchCustomers(
    @CurrentUser() user: { sub: string; role: Role },
    @Query() query: SearchCustomersQueryDto,
  ) {
    const results = await this.customerTipsService.searchCustomers(query);
    return { status: 'success', data: results };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export tip history as CSV' })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['sent', 'received', 'all'],
    description: 'Filter by direction (default: all)',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['7d', '30d', '90d', 'all'],
    description: 'Filter by time period (default: all)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['completed', 'pending', 'refunded', 'failed', 'all'],
    description: 'Filter by tip status (default: all)',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv'],
    description: 'Export format (default: csv)',
  })
  @ApiResponse({
    status: 200,
    description: 'CSV file download',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Customer role required' })
  async exportTips(
    @CurrentUser() user: { sub: string; role: Role },
    @Query() query: ExportTipsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.customerTipsService.exportTipsToCsv(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tips-export.csv"');
    res.send(csv);
  }

  @Get('history')
  @ApiOperation({ summary: "Get the current customer's tip history (staff tips + C2C, enriched with names)" })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['sent', 'received', 'all'],
    description: 'Filter by direction: sent, received, or all (default: all)',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['7d', '30d', '90d', 'all'],
    description: 'Filter by time period: 7d, 30d, 90d, or all (default: all)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['completed', 'pending', 'refunded', 'failed', 'all'],
    description: 'Filter by tip status: completed, pending, refunded, failed, or all (default: all)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tip history with sender, recipient, and merchant names',
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
                  senderName: { type: 'string', example: 'John Doe' },
                  recipientName: { type: 'string', example: 'Jane Staff' },
                  merchantName: { type: 'string', nullable: true },
                  merchantId: { type: 'string', format: 'uuid', nullable: true },
                  staffProfileId: { type: 'string', format: 'uuid' },
                  customerProfileId: { type: 'string', format: 'uuid', nullable: true },
                  qrCodeId: { type: 'string', format: 'uuid', nullable: true },
                  source: { type: 'number', example: 1 },
                  tipStatus: { type: 'number', example: 2 },
                  recipientType: { type: 'string', nullable: true, example: 'customer' },
                },
              },
            },
            total: { type: 'number', example: 52 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Access denied: Customer role required' })
  async getMyTipHistory(
    @CurrentUser() user: { sub: string; role: Role },
    @Query() query: TipHistoryQueryDto,
  ) {
    const results = await this.customerTipsService.getMyTipHistory(user, query);
    return { status: 'success', data: results };
  }
}
