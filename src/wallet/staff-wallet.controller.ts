import {
  Controller,
  Get,
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
import { Transaction } from './entities/transaction.entity';
import {
  WalletService,
  StaffConsolidatedWalletsDto,
  TransactionsListDto,
} from './wallet.service';
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

@ApiTags('Staff Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF, Role.ADMIN)
@Controller('staff/wallet')
export class StaffWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get consolidated staff wallet view across all merchants' })
  @ApiResponse({
    status: 200,
    description: 'Consolidated staff wallet view across all merchants',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            wallets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', example: 'wallet-uuid', nullable: true, description: 'Wallet UUID' },
                  merchantName: { type: 'string', example: "Joe's Restaurant" },
                  merchantShortCode: { type: 'string', example: 'CODE123456-GR' },
                  balanceAvailable: { type: 'number', example: 5000 },
                  balancePending: { type: 'number', example: 2000 },
                  balanceProcessing: { type: 'number', example: 0 },
                  reference: { type: 'string', example: 'WAL-ABC123', nullable: true, description: 'Human-readable wallet reference' },
                },
              },
            },
            totalBalances: {
              type: 'object',
              properties: {
                balanceAvailable: { type: 'number', example: 15000 },
                balancePending: { type: 'number', example: 5000 },
                balanceProcessing: { type: 'number', example: 0 },
              },
            },
          },
        },
      },
    },
  })
  async getMyWallets(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<StaffConsolidatedWalletsDto>> {
    const data = await this.walletService.getStaffConsolidatedWallets(user);
    return { status: 'success', data };
  }

  @Get(':walletId/transactions')
  @ApiOperation({ summary: 'List transactions for a specific staff wallet' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of staff wallet transactions',
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
                  amount: { type: 'number', example: 500 },
                  fee: { type: 'number', example: 25 },
                  balanceBefore: { type: 'number', example: 5000 },
                  balanceAfter: { type: 'number', example: 5475 },
                  reference: { type: 'string', example: 'TIP-1712345678-abc' },
                  description: { type: 'string', example: 'Staff tip credit' },
                  transactionStatus: { type: 'number', example: 2 },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number', example: 25 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 20 },
          },
        },
      },
    },
  })
  async getWalletTransactions(
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
}
