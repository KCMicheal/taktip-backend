import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionType } from './enums/transaction-type.enum';
import { TransactionStatus } from './enums/transaction-status.enum';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { Role } from '../auth/enums/role.enum';
import { Merchant } from '../merchant/entities/merchant.entity';

/**
 * Response DTO for wallet creation
 */
export interface WalletResponseDto {
  wallet: Wallet;
}

/**
 * Response DTO for deposit/withdraw operations
 */
export interface TransactionResponseDto {
  wallet: Wallet;
  transaction: Transaction;
}

/**
 * Response DTO for transfer operations
 */
export interface TransferResponseDto {
  sourceWallet: Wallet;
  destWallet: Wallet;
  sourceTx: Transaction;
  destTx: Transaction;
}

/**
 * Response DTO for transaction listing
 */
export interface TransactionsListDto {
  transactions: Transaction[];
  total: number;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Ensure the authenticated user has MERCHANT role
   */
  private assertMerchantRole(userRole: Role): void {
    if (userRole !== Role.MERCHANT) {
      throw new ForbiddenException('Access denied: Merchant role required');
    }
  }

  /**
   * Ensure the authenticated user owns the merchant associated with the wallet
   */
  private async assertOwnsWallet(userSub: string, wallet: Wallet): Promise<void> {
    const merchant = await this.walletRepository.manager.findOne(Merchant, {
      where: { id: wallet.merchantId },
    });

    if (!merchant || merchant.ownerId !== userSub) {
      throw new ForbiddenException('Not authorized to perform this action');
    }
  }

  /**
   * Generate a unique reference for a transaction
   */
  private generateReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * POST /wallets
   * Create a wallet for a merchant
   */
  async createWallet(
    user: { sub: string; role: Role },
    dto: CreateWalletDto,
  ): Promise<Wallet> {
    this.assertMerchantRole(user.role);

    // Check wallet doesn't already exist for this merchant
    const existing = await this.walletRepository.findOne({
      where: { merchantId: dto.merchantId },
    });

    if (existing) {
      throw new ConflictException('A wallet already exists for this merchant');
    }

    // Verify the merchant exists and belongs to this user
    const merchant = await this.walletRepository.manager.findOne(Merchant, {
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.ownerId !== user.sub) {
      throw new ForbiddenException('Not authorized to create a wallet for this merchant');
    }

    const wallet = this.walletRepository.create({
      merchantId: dto.merchantId,
      currency: dto.currency || 'NGN',
    });

    return this.walletRepository.save(wallet);
  }

  /**
   * GET /wallets/:walletId
   * Get wallet by ID
   */
  async getWalletById(
    walletId: string,
    user: { sub: string; role: Role },
  ): Promise<Wallet> {
    // Any authenticated user can view wallet info
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  /**
   * GET /wallets/merchant/:merchantId
   * Get wallet by merchant ID
   */
  async getWalletByMerchantId(
    merchantId: string,
    user: { sub: string; role: Role },
  ): Promise<Wallet> {
    // Any authenticated user can look up a merchant's wallet
    const wallet = await this.walletRepository.findOne({
      where: { merchantId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found for this merchant');
    }

    return wallet;
  }

  /**
   * POST /wallets/deposit
   * Deposit funds to a wallet
   */
  async deposit(
    user: { sub: string; role: Role },
    dto: DepositDto,
  ): Promise<TransactionResponseDto> {
    this.assertMerchantRole(user.role);

    const wallet = await this.getWalletById(dto.walletId, user);
    await this.assertOwnsWallet(user.sub, wallet);

    const reference = dto.reference || this.generateReference('DEP');

    return this.walletRepository.manager.transaction(
      async (entityManager) => {
        const currentBalance = Number(wallet.balance);
        wallet.balance = currentBalance + dto.amount;

        const transaction = entityManager.create(Transaction, {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          amount: dto.amount,
          fee: 0,
          reference,
          description: dto.description || null,
          transactionStatus: TransactionStatus.COMPLETED,
        });

        await entityManager.save(wallet);
        await entityManager.save(transaction);

        this.logger.log(`Deposit of ${dto.amount} to wallet ${wallet.id} (ref: ${reference})`);

        return { wallet, transaction };
      },
    );
  }

  /**
   * POST /wallets/withdraw
   * Withdraw funds from a wallet
   */
  async withdraw(
    user: { sub: string; role: Role },
    dto: WithdrawDto,
  ): Promise<TransactionResponseDto> {
    this.assertMerchantRole(user.role);

    const wallet = await this.getWalletById(dto.walletId, user);
    await this.assertOwnsWallet(user.sub, wallet);

    // Validate sufficient balance
    const currentBalance = Number(wallet.balance);
    if (currentBalance < dto.amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const reference = dto.reference || this.generateReference('WTH');

    return this.walletRepository.manager.transaction(
      async (entityManager) => {
        wallet.balance = currentBalance - dto.amount;

        const transaction = entityManager.create(Transaction, {
          walletId: wallet.id,
          type: TransactionType.WITHDRAW,
          amount: dto.amount,
          fee: 0,
          reference,
          description: dto.description || null,
          transactionStatus: TransactionStatus.COMPLETED,
        });

        await entityManager.save(wallet);
        await entityManager.save(transaction);

        this.logger.log(`Withdraw of ${dto.amount} from wallet ${wallet.id} (ref: ${reference})`);

        return { wallet, transaction };
      },
    );
  }

  /**
   * GET /wallets/:walletId/transactions
   * List wallet transactions with pagination
   */
  async getTransactions(
    walletId: string,
    user: { sub: string; role: Role },
    query: { page?: number; limit?: number },
  ): Promise<TransactionsListDto> {
    // Any authenticated user can view transactions
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where: { walletId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, total };
  }

  /**
   * POST /wallets/transfer
   * Transfer funds between wallets
   */
  async transfer(
    user: { sub: string; role: Role },
    dto: TransferDto,
  ): Promise<TransferResponseDto> {
    this.assertMerchantRole(user.role);

    if (dto.sourceWalletId === dto.destinationWalletId) {
      throw new BadRequestException('Source and destination wallets must be different');
    }

    const sourceWallet = await this.getWalletById(dto.sourceWalletId, user);
    const destWallet = await this.getWalletById(dto.destinationWalletId, user);

    // Verify ownership of source wallet
    await this.assertOwnsWallet(user.sub, sourceWallet);

    // Validate source wallet has sufficient balance
    const sourceBalance = Number(sourceWallet.balance);
    if (sourceBalance < dto.amount) {
      throw new BadRequestException('Insufficient balance in source wallet');
    }

    const sourceRef = this.generateReference('TRF_OUT');
    const destRef = this.generateReference('TRF_IN');

    return this.walletRepository.manager.transaction(
      async (entityManager) => {
        // Debit source wallet
        sourceWallet.balance = sourceBalance - dto.amount;

        const sourceTx = entityManager.create(Transaction, {
          walletId: sourceWallet.id,
          type: TransactionType.TRANSFER_OUT,
          amount: dto.amount,
          fee: 0,
          reference: sourceRef,
          description: dto.description || `Transfer to wallet ${destWallet.id}`,
          transactionStatus: TransactionStatus.COMPLETED,
        });

        // Credit destination wallet
        const destBalance = Number(destWallet.balance);
        destWallet.balance = destBalance + dto.amount;

        const destTx = entityManager.create(Transaction, {
          walletId: destWallet.id,
          type: TransactionType.TRANSFER_IN,
          amount: dto.amount,
          fee: 0,
          reference: destRef,
          description: dto.description || `Transfer from wallet ${sourceWallet.id}`,
          transactionStatus: TransactionStatus.COMPLETED,
        });

        await entityManager.save(sourceWallet);
        await entityManager.save(destWallet);
        await entityManager.save(sourceTx);
        await entityManager.save(destTx);

        this.logger.log(
          `Transfer of ${dto.amount} from wallet ${sourceWallet.id} to ${destWallet.id}`,
        );

        return {
          sourceWallet,
          destWallet,
          sourceTx,
          destTx,
        };
      },
    );
  }
}
