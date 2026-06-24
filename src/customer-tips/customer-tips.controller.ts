import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { CustomerTipsService } from './customer-tips.service';
import { SendCustomerTipDto, SearchCustomersQueryDto } from './dto/send-customer-tip.dto';
import { PaginationParamsDto } from '../common/pagination';
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

  @Get('history')
  @ApiOperation({ summary: "Get the current customer's C2C tip history" })
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
  @ApiResponse({ status: 200, description: 'Paginated sent/received tips' })
  async getMyTipHistory(
    @CurrentUser() user: { sub: string; role: Role },
    @Query() query: PaginationParamsDto,
  ) {
    const results = await this.customerTipsService.getMyTipHistory(user, query);
    return { status: 'success', data: results };
  }
}
