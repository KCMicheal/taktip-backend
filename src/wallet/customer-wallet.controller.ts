import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
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
import { CustomerDepositDto } from './dto/customer-deposit.dto';
import { TipFromWalletDto } from './dto/tip-from-wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomerService } from '../customer/customer.service';
import { Role } from '../auth/enums/role.enum';
import { TipsService } from '../tips/tips.service';
import { TipSource } from '../tips/enums/tip-source.enum';
import { Tip } from '../tips/entities/tip.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
    private readonly tipsService: TipsService,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
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
  @ApiResponse({
    status: 200,
    description: 'Customer wallet details',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            ownerId: { type: 'string', format: 'uuid' },
            ownerType: { type: 'string', example: 'customer' },
            balancePending: { type: 'number', example: 0 },
            balanceAvailable: { type: 'number', example: 5000 },
            balanceProcessing: { type: 'number', example: 0 },
            currency: { type: 'string', example: 'NGN' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async getMyWallet(
    @CurrentUser() user: { sub: string; role: Role },
  ): Promise<SuccessResponseDto<Wallet>> {
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    return { status: 'success', data: wallet };
  }

  @Post('deposit')
  @ApiOperation({ summary: "Deposit funds to the customer's own wallet (creates wallet if none exists)" })
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
                balanceAvailable: { type: 'number', example: 10000 },
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
                description: { type: 'string', example: 'Customer deposit' },
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

  @Post('tip')
  @ApiOperation({ summary: 'Tip a staff member from wallet balance' })
  @ApiResponse({
    status: 201,
    description: 'Tip sent successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            tip: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                merchantId: { type: 'string', format: 'uuid' },
                staffProfileId: { type: 'string', format: 'uuid' },
                customerProfileId: { type: 'string', format: 'uuid' },
                amount: { type: 'number', example: 500 },
                currency: { type: 'string', example: 'NGN' },
                message: { type: 'string', example: 'Great service!' },
                source: { type: 'number', example: 2 },
                tipStatus: { type: 'number', example: 1 },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            transactions: {
              type: 'object',
              properties: {
                tipOutTx: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'number', example: 5 }, amount: { type: 'number' } } },
                tipInTx: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'number', example: 6 }, amount: { type: 'number' } } },
                feeTx: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'number', example: 7 }, amount: { type: 'number' } } },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Insufficient balance or invalid amount' })
  @ApiResponse({ status: 404, description: 'Staff profile or wallet not found' })
  async tipFromWallet(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: TipFromWalletDto,
  ): Promise<SuccessResponseDto<{
    tip: Tip;
    transactions: {
      tipOutTx: Transaction;
      tipInTx: Transaction;
      feeTx: Transaction;
    };
  }>> {
    // 1. Resolve customer profile + wallet
    const { profileId: customerProfileId, wallet: customerWallet } = await this.resolveCustomerWallet(user.sub);

    // 2. Validate staff profile exists and is active
    const staffProfile = await this.staffProfileRepository.findOne({
      where: { id: dto.staffProfileId },
    });
    if (!staffProfile) {
      throw new NotFoundException('Staff profile not found');
    }
    if (!staffProfile.merchantId) {
      throw new BadRequestException('Staff profile is not associated with any merchant');
    }

    // 3. Get staff wallet
    const staffWallet = await this.walletService.getStaffWallet(staffProfile.id);

    // 4. Execute atomic transfer (debit customer, credit staff less 5% fee)
    const transactions = await this.walletService.tipFromBalance(
      customerWallet.id,
      staffWallet.id,
      dto.amount,
    );

    // 5. Record the tip with COMPLETED status (funds moved atomically)
    const tip = await this.tipsService.recordTip({
      merchantId: staffProfile.merchantId,
      staffProfileId: staffProfile.id,
      customerProfileId,
      amount: dto.amount,
      currency: customerWallet.currency,
      message: dto.message,
      source: TipSource.WALLET,
    });

    return {
      status: 'success',
      data: { tip, transactions },
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: "List the customer's wallet transactions" })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of customer wallet transactions',
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
                  balanceBefore: { type: 'number', example: 5000 },
                  balanceAfter: { type: 'number', example: 10000 },
                  reference: { type: 'string', example: 'DEP-1712345678-abc' },
                  description: { type: 'string', example: 'Customer deposit' },
                  transactionStatus: { type: 'number', example: 2 },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            total: { type: 'number', example: 10 },
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
