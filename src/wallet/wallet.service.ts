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
import { StaffProfile } from '../staff/entities/staff-profile.entity';

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
   * Ensure the authenticated user owns (or is ADMIN of) the wallet.
   *
   * Ownership rules by ownerType:
   *   merchant     → Merchant.ownerId === userSub
   *   staff        → StaffProfile.userId === userSub
   *   customer     → wallet.ownerId === userSub (direct)
   *   independent  → wallet.ownerId === userSub (direct)
   *   ADMIN role   → always allowed (bypass)
   */
  private async assertOwnsWallet(userSub: string, wallet: Wallet, userRole?: Role): Promise<void> {
    // ADMIN bypass
    if (userRole === Role.ADMIN) {
      return;
    }

    switch (wallet.ownerType) {
      case 'merchant': {
        const merchant = await this.walletRepository.manager.findOne(Merchant, {
          where: { id: wallet.ownerId },
        });
        if (!merchant || merchant.ownerId !== userSub) {
          throw new ForbiddenException('Not authorized to perform this action');
        }
        return;
      }
      case 'staff': {
        const staffProfile = await this.walletRepository.manager.findOne(StaffProfile, {
          where: { id: wallet.ownerId },
        });
        if (!staffProfile || staffProfile.userId !== userSub) {
          throw new ForbiddenException('Not authorized to perform this action');
        }
        return;
      }
      case 'customer':
      case 'independent': {
        // Direct ownership — wallet ownerId IS the user's ID
        if (wallet.ownerId !== userSub) {
          throw new ForbiddenException('Not authorized to perform this action');
        }
        return;
      }
      default:
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
   * Create a wallet for a polymorphic owner
   */
  async createWallet(
    user: { sub: string; role: Role },
    dto: CreateWalletDto,
  ): Promise<Wallet> {
    // Only merchants or admins can create wallets via this endpoint.
    // Staff wallets are auto-created on profile creation (Phase 3).
    // Customer wallets are created on first deposit (Phase 4).
    if (user.role !== Role.MERCHANT && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied: Merchant or Admin role required');
    }

    // Verify the owner exists and the caller has permission
    switch (dto.ownerType) {
      case 'merchant': {
        const merchant = await this.walletRepository.manager.findOne(Merchant, {
          where: { id: dto.ownerId },
        });
        if (!merchant) {
          throw new NotFoundException('Merchant not found');
        }
        if (merchant.ownerId !== user.sub) {
          throw new ForbiddenException('Not authorized to create a wallet for this merchant');
        }
        break;
      }
      default:
        // For non-merchant types, check direct ownership or ADMIN
        if (dto.ownerId !== user.sub && user.role !== Role.ADMIN) {
          throw new ForbiddenException('Not authorized to create this wallet');
        }
    }

    // Check wallet doesn't already exist for this owner
    const existing = await this.walletRepository.findOne({
      where: { ownerId: dto.ownerId, ownerType: dto.ownerType },
    });

    if (existing) {
      throw new ConflictException(`A wallet already exists for this ${dto.ownerType}`);
    }

    const wallet = this.walletRepository.create({
      ownerId: dto.ownerId,
      ownerType: dto.ownerType,
      balanceAvailable: 0,
      balancePending: 0,
      balanceProcessing: 0,
      currency: dto.currency || 'NGN',
    } as Partial<Wallet>);

    return this.walletRepository.save(wallet);
  }

  /**
   * GET /wallets/:walletId
   * Get wallet by ID — enforces polymorphic ownership.
   */
  async getWalletById(
    walletId: string,
    user: { sub: string; role: Role },
  ): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Enforce polymorphic ownership
    await this.assertOwnsWallet(user.sub, wallet, user.role);

    return wallet;
  }

  /**
   * GET /wallets/merchant/:merchantId
   * Get wallet by merchant ID — enforces polymorphic ownership.
   */
  async getWalletByMerchantId(
    merchantId: string,
    user: { sub: string; role: Role },
  ): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { ownerId: merchantId, ownerType: 'merchant' },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found for this merchant');
    }

    // Enforce polymorphic ownership
    await this.assertOwnsWallet(user.sub, wallet, user.role);

    return wallet;
  }

  /**
   * GET /wallets/by-owner/:ownerId
   * Find a wallet by polymorphic owner — enforces ownership.
   * This is the primary lookup for role-scoped endpoints (Phase 2).
   */
  async getWalletByOwnerId(
    ownerId: string,
    ownerType: string,
    user: { sub: string; role: Role },
  ): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { ownerId, ownerType },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found for this owner');
    }

    // Enforce polymorphic ownership
    await this.assertOwnsWallet(user.sub, wallet, user.role);

    return wallet;
  }

  /**
   * Promote funds from balance_pending to balance_available.
   * Called by BullMQ cron job after PSP confirmation + holding period.
   */
  async promoteToAvailable(walletId: string, amount: number): Promise<void> {
    await this.walletRepository.manager.transaction(async (entityManager) => {
      // Atomic: decrement pending, increment available
      await entityManager.query(
        'UPDATE "wallets" ' +
        'SET "balance_pending" = CAST("balance_pending" AS numeric(15,2)) - $1, ' +
        '"balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 ' +
        'WHERE "id" = $2 AND "balance_pending" >= $1',
        [amount, walletId],
      );
    });

    this.logger.log(`Promoted ${amount} from pending to available for wallet ${walletId}`);
  }

  /**
   * POST /wallets/deposit
   * Deposit funds to a wallet — uses atomic SQL increment to prevent lost writes
   * under concurrent requests on the same wallet.
   */
  async deposit(
    user: { sub: string; role: Role },
    dto: DepositDto,
  ): Promise<TransactionResponseDto> {
    // Ownership is enforced inside getWalletById
    const wallet = await this.getWalletById(dto.walletId, user);
    // Ownership is enforced inside getWalletById

    const reference = dto.reference || this.generateReference('DEP');

    return this.walletRepository.manager.transaction(
      async (entityManager) => {
        // Atomic increment — PostgreSQL locks the row and computes inline,
        // so concurrent requests always see a consistent balance.
        await entityManager.query(
          'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
          [dto.amount, wallet.id],
        );

        // Re-fetch to get the updated balance from the DB
        const updatedWallet = await entityManager.findOne(Wallet, {
          where: { id: wallet.id },
        });

        const transaction = entityManager.create(Transaction, {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          amount: dto.amount,
          fee: 0,
          reference,
          description: dto.description || null,
          transactionStatus: TransactionStatus.COMPLETED,
          balanceBefore: wallet.balanceAvailable,
          balanceAfter: (wallet.balanceAvailable + dto.amount),
        });

        await entityManager.save(transaction);

        this.logger.log(`Deposit of ${dto.amount} to wallet ${wallet.id} (ref: ${reference})`);

        return { wallet: updatedWallet!, transaction };
      },
    );
  }

  /**
   * POST /wallets/withdraw
   * Withdraw funds from a wallet — uses atomic SQL decrement with an
   * inline balance guard to prevent overspending under race.
   */
  async withdraw(
    user: { sub: string; role: Role },
    dto: WithdrawDto,
  ): Promise<TransactionResponseDto> {
    // Ownership is enforced inside getWalletById
    const wallet = await this.getWalletById(dto.walletId, user);
    // Ownership is enforced inside getWalletById

    const reference = dto.reference || this.generateReference('WTH');

    return this.walletRepository.manager.transaction(
      async (entityManager) => {
        // Atomic decrement with inline guard: UPDATE returns 0 rows
        // when balance < amount, preventing concurrent overspend.
        const result: any[] = await entityManager.query(
          'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) - $1 WHERE "id" = $2 AND "balance_available" >= $1',
          [dto.amount, wallet.id],
        );

        if (result.length === 0) {
          throw new BadRequestException('Insufficient wallet balance');
        }

        // Re-fetch to get the updated balance from the DB
        const updatedWallet = await entityManager.findOne(Wallet, {
          where: { id: wallet.id },
        });

        const transaction = entityManager.create(Transaction, {
          walletId: wallet.id,
          type: TransactionType.WITHDRAW,
          amount: dto.amount,
          fee: 0,
          reference,
          description: dto.description || null,
          transactionStatus: TransactionStatus.COMPLETED,
          balanceBefore: wallet.balanceAvailable,
          balanceAfter: (wallet.balanceAvailable - dto.amount),
        });

        await entityManager.save(transaction);

        this.logger.log(`Withdraw of ${dto.amount} from wallet ${wallet.id} (ref: ${reference})`);

        return { wallet: updatedWallet!, transaction };
      },
    );
  }

  /**
   * GET /wallets/:walletId/transactions
   * List wallet transactions with pagination — enforces ownership.
   */
  async getTransactions(
    walletId: string,
    user: { sub: string; role: Role },
    query: { page?: number; limit?: number },
  ): Promise<TransactionsListDto> {
    // Enforce ownership: look up wallet, then assert ownership
    const wallet = await this.getWalletById(walletId, user);
    // Ownership is enforced inside getWalletById

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { transactions, total };
  }

  /**
   * POST /wallets/transfer
   * Transfer funds between two wallets — uses atomic SQL increments /
   * decrements to prevent race conditions on both source and destination.
   */
  async transfer(
    user: { sub: string; role: Role },
    dto: TransferDto,
  ): Promise<TransferResponseDto> {
    // Source wallet ownership is enforced inside getWalletById.
    // Destination wallet is unrestricted (any wallet can receive).
    const sourceWallet = await this.getWalletById(dto.sourceWalletId, user);
    // Ownership of source wallet is enforced inside getWalletById.
    // Destination wallet is looked up directly (no ownership check) because
    // transfers can target any wallet (e.g. paying a staff member).
    const destWallet = await this.walletRepository.findOne({
      where: { id: dto.destinationWalletId },
    });

    if (!destWallet) {
      throw new NotFoundException('Destination wallet not found');
    }

    // Prevent self-transfer
    if (dto.sourceWalletId === dto.destinationWalletId) {
      throw new BadRequestException('Source and destination wallets must be different');
    }

    const sourceRef = this.generateReference('TRF_OUT');
    const destRef = this.generateReference('TRF_IN');

    return this.walletRepository.manager.transaction(
      async (entityManager) => {
        // Source: atomic decrement with inline guard
        const srcResult: any[] = await entityManager.query(
          'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) - $1 WHERE "id" = $2 AND "balance_available" >= $1',
          [dto.amount, sourceWallet.id],
        );

        if (srcResult.length === 0) {
          throw new BadRequestException('Insufficient balance in source wallet');
        }

        // Destination: atomic increment (no guard needed)
        await entityManager.query(
          'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
          [dto.amount, destWallet.id],
        );

        // Re-fetch both wallets for the response
        const updatedSource = await entityManager.findOne(Wallet, {
          where: { id: sourceWallet.id },
        });
        const updatedDest = await entityManager.findOne(Wallet, {
          where: { id: destWallet.id },
        });

        const sourceTx = entityManager.create(Transaction, {
          walletId: sourceWallet.id,
          type: TransactionType.TRANSFER_OUT,
          amount: dto.amount,
          fee: 0,
          reference: sourceRef,
          description: dto.description || null,
          transactionStatus: TransactionStatus.COMPLETED,
          balanceBefore: sourceWallet.balanceAvailable,
          balanceAfter: (sourceWallet.balanceAvailable - dto.amount),
        });

        const destTx = entityManager.create(Transaction, {
          walletId: destWallet.id,
          type: TransactionType.TRANSFER_IN,
          amount: dto.amount,
          fee: 0,
          reference: destRef,
          description: dto.description || null,
          transactionStatus: TransactionStatus.COMPLETED,
          balanceBefore: destWallet.balanceAvailable,
          balanceAfter: (destWallet.balanceAvailable + dto.amount),
        });

        await entityManager.save(sourceTx);
        await entityManager.save(destTx);

        this.logger.log(
          `Transfer of ${dto.amount} from wallet ${sourceWallet.id} to ${destWallet.id}`,
        );

        return {
          sourceWallet: updatedSource!,
          destWallet: updatedDest!,
          sourceTx,
          destTx,
        };
      },
    );
  }
}