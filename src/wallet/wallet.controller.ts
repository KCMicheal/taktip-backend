import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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
import { WalletService, TransactionResponseDto, TransferResponseDto, TransactionsListDto } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * Generic success response wrapper
 */
class SuccessResponseDto<T> {
  status: string;
  data: T;
}

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @ApiOperation({ summary: 'Create a wallet for a polymorphic owner' })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 409, description: 'Wallet already exists for this owner' })
  async createWallet(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: CreateWalletDto,
  ): Promise<SuccessResponseDto<Wallet>> {
    const data = await this.walletService.createWallet(user, dto);
    return { status: 'success', data };
  }

  @Get(':walletId')
  @ApiOperation({ summary: 'Get wallet by ID' })
  @ApiResponse({ status: 200, description: 'Wallet found' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(
    @Param('walletId') walletId: string,
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<Wallet>> {
    const data = await this.walletService.getWalletById(walletId, user);
    return { status: 'success', data };
  }

  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Get wallet by merchant ID' })
  @ApiResponse({ status: 200, description: 'Wallet found' })
  @ApiResponse({ status: 404, description: 'Wallet not found for this merchant' })
  async getMerchantWallet(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<Wallet>> {
    const data = await this.walletService.getWalletByMerchantId(merchantId, user);
    return { status: 'success', data };
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit to wallet' })
  @ApiResponse({ status: 201, description: 'Deposit completed' })
  @ApiResponse({ status: 400, description: 'Invalid deposit amount' })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required' })
  async deposit(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: DepositDto,
  ): Promise<SuccessResponseDto<TransactionResponseDto>> {
    const data = await this.walletService.deposit(user, dto);
    return { status: 'success', data };
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw from wallet' })
  @ApiResponse({ status: 201, description: 'Withdrawal completed' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid amount' })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required' })
  async withdraw(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: WithdrawDto,
  ): Promise<SuccessResponseDto<TransactionResponseDto>> {
    const data = await this.walletService.withdraw(user, dto);
    return { status: 'success', data };
  }

  @Get(':walletId/transactions')
  @ApiOperation({ summary: 'List wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async getTransactions(
    @Param('walletId') walletId: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SuccessResponseDto<TransactionsListDto>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const data = await this.walletService.getTransactions(walletId, user, {
      page: pageNum,
      limit: limitNum,
    });
    return { status: 'success', data };
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer between wallets' })
  @ApiResponse({ status: 201, description: 'Transfer completed' })
  @ApiResponse({ status: 400, description: 'Invalid transfer parameters or insufficient balance' })
  @ApiResponse({ status: 403, description: 'Access denied: Merchant role required' })
  async transfer(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: TransferDto,
  ): Promise<SuccessResponseDto<TransferResponseDto>> {
    const data = await this.walletService.transfer(user, dto);
    return { status: 'success', data };
  }
}
