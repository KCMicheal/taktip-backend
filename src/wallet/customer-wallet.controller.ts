import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Inject,
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
import { VerifyDepositDto } from './dto/verify-deposit.dto';
import { TipFromWalletDto } from './dto/tip-from-wallet.dto';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { TransactionType } from './enums/transaction-type.enum';
import { TransactionStatus } from './enums/transaction-status.enum';
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
import { User } from '../auth/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER } from '../payments/providers/providers.constants';
import { PaymentProvider } from '../payments/providers/interfaces/payment-provider.interface';

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
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

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
  @ApiOperation({ summary: 'Initiate a wallet deposit via Paystack (returns authorization URL)' })
  @ApiResponse({
    status: 201,
    description: 'Paystack checkout URL',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            authorizationUrl: { type: 'string', example: 'https://checkout.paystack.com/abc123' },
            reference: { type: 'string', example: 'TXT-1712345678-abc' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid deposit amount or customer email not found' })
  async deposit(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: CustomerDepositDto,
  ): Promise<SuccessResponseDto<{ authorizationUrl: string; reference: string }>> {
    const { wallet } = await this.resolveCustomerWallet(user.sub);

    // Resolve customer email from the User entity
    const customerProfile = await this.customerService.getOrCreateProfile(user.sub);
    const customerUser = await this.userRepository.findOne({
      where: { id: customerProfile.userId },
    });
    if (!customerUser?.email) {
      throw new BadRequestException('Customer email not found — cannot initiate deposit');
    }


    // Initialize Paystack transaction with deposit metadata
    const result = await this.paymentProvider.initializeTransaction({
      email: customerUser.email,
      amount: dto.amount,

      metadata: {
        walletId: wallet.id,
        deposit: true,
      },
    });

    return {
      status: 'success',
      data: {
        authorizationUrl: result.authorizationUrl,
        reference: result.reference,
      },
    };
  }

  @Get('deposit/status')
  @ApiOperation({ summary: 'Poll deposit payment status by reference' })
  @ApiQuery({ name: 'reference', required: true, type: String, description: 'Paystack transaction reference' })
  @ApiResponse({
    status: 200,
    description: 'Deposit payment status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            paymentStatus: { type: 'number', example: 1 },
            amount: { type: 'number', example: 5000 },
            reference: { type: 'string', example: 'TXT-1712345678-abc' },
          },
        },
      },
    },
  })
  async depositStatus(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('reference') reference: string,
  ): Promise<SuccessResponseDto<{
    paymentStatus: number;
    amount: number;
    reference: string;
  }>> {
    if (!reference) {
      throw new BadRequestException('Payment reference is required');
    }

    const payment = await this.paymentRepository.findOne({ where: { reference } });
    if (!payment) {
      throw new NotFoundException('Payment not found for the given reference');
    }

    // Verify the payment belongs to this customer's wallet
    const metadata = payment.metadata as Record<string, unknown> | null;
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    if (metadata?.walletId !== wallet.id) {
      throw new NotFoundException('Payment not found for your wallet');
    }

    return {
      status: 'success',
      data: {
        paymentStatus: payment.paymentStatus,
        amount: payment.amount,
        reference: payment.reference,
      },
    };
  }

  @Post('deposit/verify')
  @ApiOperation({ summary: 'Verify a deposit after Paystack redirect (UX feedback only — webhook is the source of truth for crediting)' })
  @ApiResponse({
    status: 200,
    description: 'Deposit verification result',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            amount: { type: 'number', example: 5000 },
            reference: { type: 'string', example: 'TXT-1712345678-abc' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async verifyDeposit(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() dto: VerifyDepositDto,
  ): Promise<SuccessResponseDto<{
    status: 'success' | 'failed';
    amount: number;
    reference: string;
  }>> {
    // Find the payment record locally
    const payment = await this.paymentRepository.findOne({ where: { reference: dto.reference } });
    if (!payment) {
      throw new NotFoundException('Payment not found for the given reference');
    }

    // Verify the payment belongs to this customer's wallet
    const metadata = payment.metadata;
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    if (metadata?.walletId !== wallet.id) {
      throw new NotFoundException('Payment not found for your wallet');
    }

    // Call Paystack to verify the actual transaction status
    // This is the authoritative check — Paystack returns the real state
    try {
      const result = await this.paymentProvider.verifyTransaction(dto.reference);
      return {
        status: 'success',
        data: {
          status: result.status ? 'success' : 'failed',
          amount: result.amount,
          reference: dto.reference,
        },
      };
    } catch {
      // If the Paystack API call fails (network error, timeout), fall back
      // to our local payment record status so the FE still gets an answer.
      return {
        status: 'success',
        data: {
          status: payment.paymentStatus === PaymentStatus.SUCCESS ? 'success' : 'failed',
          amount: payment.amount,
          reference: dto.reference,
        },
      };
    }
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
  @ApiQuery({ name: 'type', required: false, enum: TransactionType, description: 'Filter by transaction type (single value, e.g. 1 = DEPOSIT, 2 = WITHDRAW)' })
  @ApiQuery({ name: 'status', required: false, enum: TransactionStatus, description: 'Filter by transaction status (single value, e.g. 1 = PENDING, 2 = COMPLETED, 3 = FAILED)' })
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
    @Query() query: TransactionHistoryQueryDto,
  ): Promise<SuccessResponseDto<TransactionsListDto>> {
    const { wallet } = await this.resolveCustomerWallet(user.sub);
    const data = await this.walletService.getTransactions(wallet.id, user, query);
    return { status: 'success', data };
  }
}
