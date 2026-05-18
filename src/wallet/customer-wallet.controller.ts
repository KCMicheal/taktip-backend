import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { WalletService, TransactionResponseDto, TransactionsListDto } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { CustomerDepositDto } from './dto/customer-deposit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerService } from '../customer/customer.service';
import { Role } from '../auth/enums/role.enum';

/**
 * Generic success response wrapper
 */
class SuccessResponseDto<T> {
  status: string;
  data: T;
}

@ApiTags('Customer Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.ADMIN)
@Controller('customer/wallet')
export class CustomerWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly customerService: CustomerService,
  ) {}

  /**
   * Resolve the customer's profile and wallet in a single step.
   */
  private async resolveCustomerWallet(userSub: string): Promise<{ profileId: string; wallet: Wallet }> {
    const profile = await this.customerService.getOrCreateProfile(userSub);
    const wallet = await this.walletService.getOrCreateCustomerWallet(profile.id);
    return { profileId: profile.id, wallet };
  }

  @Get()
  @ApiOperation({ summary: "Get the customer's own wallet (creates one if none exists)" })
  @ApiResponse({ status: 200, description: 'Customer wallet found or created' })
  async getMyWallet(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<Wallet>> {
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    return { status: 'success', data: wallet };
  }

  @Post('deposit')
  @ApiOperation({ summary: "Deposit funds to the customer's own wallet (creates wallet if none exists)" })
  @ApiResponse({ status: 201, description: 'Deposit completed' })
  @ApiResponse({ status: 400, description: 'Invalid deposit amount' })
  async deposit(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: CustomerDepositDto,
  ): Promise<SuccessResponseDto<TransactionResponseDto>> {
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    const data = await this.walletService.deposit(user, {
      walletId: wallet.id,
      amount: dto.amount,
      reference: dto.reference,
      description: dto.description,
    });
    return { status: 'success', data };
  }

  @Get('transactions')
  @ApiOperation({ summary: "List the customer's wallet transactions" })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async getMyTransactions(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SuccessResponseDto<TransactionsListDto>> {
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const data = await this.walletService.getTransactions(wallet.id, user, {
      page: pageNum,
      limit: limitNum,
    });
    return { status: 'success', data };
  }
}
