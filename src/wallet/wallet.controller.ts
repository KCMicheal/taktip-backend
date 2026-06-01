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
import { Transaction } from './entities/transaction.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
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

@ApiTags('Admin Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @ApiOperation({ summary: 'Create a wallet for a polymorphic owner' })
  @ApiResponse({
    status: 201,
    description: 'Wallet created successfully',
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
            balancePending: { type: 'number', example: 0 },
            balanceAvailable: { type: 'number', example: 0 },
            balanceProcessing: { type: 'number', example: 0 },
            currency: { type: 'string', example: 'NGN' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Wallet details',
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
            balancePending: { type: 'number', example: 0 },
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
  async getWallet(
    @Param('walletId') walletId: string,
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<Wallet>> {
    const data = await this.walletService.getWalletById(walletId, user);
    return { status: 'success', data };
  }

  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Get wallet by merchant ID' })
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
  @ApiResponse({
    status: 201,
    description: 'Deposit completed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            wallet: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                balancePending: { type: 'number', example: 0 },
                balanceAvailable: { type: 'number', example: 15000 },
                balanceProcessing: { type: 'number', example: 0 },
                currency: { type: 'string', example: 'NGN' },
              },
            },
            transaction: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                type: { type: 'number', example: 1 },
                amount: { type: 'number', example: 5000 },
                fee: { type: 'number', example: 0 },
                reference: { type: 'string', example: 'DEP-1712345678-abc' },
                description: { type: 'string', example: 'Wallet deposit' },
                transactionStatus: { type: 'number', example: 2 },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid deposit amount' })
  @ApiResponse({ status: 403, description: 'Access denied: Admin role required' })
  async deposit(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: DepositDto,
  ): Promise<SuccessResponseDto<TransactionResponseDto>> {
    const data = await this.walletService.deposit(user, dto);
    return { status: 'success', data };
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw from wallet' })
  @ApiResponse({
    status: 201,
    description: 'Withdrawal completed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            wallet: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                balanceAvailable: { type: 'number', example: 10000 },
                currency: { type: 'string', example: 'NGN' },
              },
            },
            transaction: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                type: { type: 'number', example: 2 },
                amount: { type: 'number', example: 5000 },
                fee: { type: 'number', example: 0 },
                reference: { type: 'string', example: 'WTH-1712345678-abc' },
                description: { type: 'string', example: 'Wallet withdrawal' },
                transactionStatus: { type: 'number', example: 2 },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid amount' })
  @ApiResponse({ status: 403, description: 'Access denied: Admin role required' })
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
  @ApiResponse({
    status: 200,
    description: 'Paginated list of wallet transactions',
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
  @ApiResponse({
    status: 201,
    description: 'Transfer completed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            sourceWallet: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                balanceAvailable: { type: 'number', example: 5000 },
              },
            },
            destWallet: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                balanceAvailable: { type: 'number', example: 15000 },
              },
            },
            sourceTx: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                type: { type: 'number', example: 3 },
                amount: { type: 'number', example: 5000 },
                reference: { type: 'string', example: 'TRF-1712345678-abc' },
                transactionStatus: { type: 'number', example: 2 },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            destTx: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                type: { type: 'number', example: 4 },
                amount: { type: 'number', example: 5000 },
                reference: { type: 'string', example: 'TRF-1712345678-def' },
                transactionStatus: { type: 'number', example: 2 },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid transfer parameters or insufficient balance' })
  @ApiResponse({ status: 403, description: 'Access denied: Admin role required' })
  async transfer(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: TransferDto,
  ): Promise<SuccessResponseDto<TransferResponseDto>> {
    const data = await this.walletService.transfer(user, dto);
    return { status: 'success', data };
  }
}
