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
import { WalletService, TransactionResponseDto, TransactionsListDto } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';

/**
 * Generic success response wrapper
 */
class SuccessResponseDto<T> {
  status: string;
  data: T;
}

@ApiTags('Merchant Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MERCHANT, Role.ADMIN)
@Controller('merchant/wallet')
export class MerchantWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get the merchant\'s own wallet' })
  @ApiResponse({
    status: 200,
    description: 'Merchant wallet details',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            ownerId: { type: 'string', format: 'uuid' },
            ownerType: { type: 'string', example: 'merchant' },
            balancePending: { type: 'number', example: 5000 },
            balanceAvailable: { type: 'number', example: 10000 },
            balanceProcessing: { type: 'number', example: 0 },
            currency: { type: 'string', example: 'NGN' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getMyWallet(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<Wallet>> {
    // Merchant wallet ownerId = merchant.id, not user.sub.
    // Use the convenience method that resolves user.sub → merchant.id first.
    const data = await this.walletService.getOrCreateMerchantWallet(user);
    return { status: 'success', data };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List merchant wallet transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of merchant wallet transactions',
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
                  type: { type: 'number', example: 1 },
                  amount: { type: 'number', example: 5000 },
                  fee: { type: 'number', example: 0 },
                  balanceBefore: { type: 'number', example: 10000 },
                  balanceAfter: { type: 'number', example: 15000 },
                  reference: { type: 'string', example: 'DEP-1712345678-abc' },
                  description: { type: 'string', example: 'Wallet deposit' },
                  transactionStatus: { type: 'number', example: 2 },
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
  async getMyTransactions(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<SuccessResponseDto<TransactionsListDto>> {
    // First, look up the merchant's wallet by user ID (resolves merchant.id internally)
    const wallet = await this.walletService.getOrCreateMerchantWallet(user);
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const data = await this.walletService.getTransactions(wallet.id, user, {
      page: pageNum,
      limit: limitNum,
    });
    return { status: 'success', data };
  }
}
