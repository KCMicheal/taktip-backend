import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionType } from './enums/transaction-type.enum';
import { TransactionStatus } from './enums/transaction-status.enum';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { Role } from '../auth/enums/role.enum';
import { Merchant } from '../merchant/entities/merchant.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { PaginationService, PaginatedResult } from '../common/pagination';
import { EntityStatus } from '../common/enums/entity-status.enum';

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
 * Re-export PaginatedResult<Transaction> for controller imports
 */
export type TransactionsListDto = PaginatedResult<Transaction>;

/**
 * A single wallet entry in the staff consolidated view
 */
export interface StaffWalletEntryDto {
  id: string | null;
  merchantName: string;
  merchantShortCode: string;
  balanceAvailable: number;
  balancePending: number;
  balanceProcessing: number;
  reference: string | null;
}

/**
 * Response DTO for the staff consolidated wallet view
 */
export interface StaffConsolidatedWalletsDto {
  wallets: StaffWalletEntryDto[];
  totalBalances: {
    balanceAvailable: number;
    balancePending: number;
    balanceProcessing: number;
  };
}

/**
 * Well-known ownerId for the platform fee collection wallet.
 * This wallet receives 5% of every internal (tip-from-balance) transaction.
 */
export const PLATFORM_WALLET_OWNER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Well-known ownerType for the platform fee collection wallet.
 */
export const PLATFORM_WALLET_OWNER_TYPE = 'system';

/**
 * Platform fee percentage (5%).
 */
export const PLATFORM_FEE_PERCENT = 0.05;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Ensure the authenticated user owns (or is ADMIN of) the wallet.
   *
   * Ownership rules by ownerType:
   *   merchant     → Merchant.ownerId === userSub
   *   staff        → StaffProfile.userId === userSub
   *   customer     → CustomerProfile.userId === userSub
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
      case 'customer': {
        // Customer wallet ownerId = CustomerProfile.id, not user.sub
        const customerProfile = await this.walletRepository.manager.findOne(CustomerProfile, {
          where: { id: wallet.ownerId },
        });
        if (!customerProfile || customerProfile.userId !== userSub) {
          throw new ForbiddenException('Not authorized to perform this action');
        }
        return;
      }
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
   * Generate a unique wallet reference in the format WAL-XXXXXX
   * (6 random alphanumeric characters). Checks the database for
   * collisions before returning. Retries up to 10 times.
   */
  private async generateWalletReference(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let randomPart = '';
      for (let i = 0; i < 6; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const reference = `WAL-${randomPart}`;

      const existing = await this.walletRepository.findOne({
        where: { reference },
      });

      if (!existing) {
        return reference;
      }
    }

    throw new ConflictException('Unable to generate unique wallet reference');
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
      reference: await this.generateWalletReference(),
    } as Partial<Wallet>);

    return this.walletRepository.save(wallet);
  }

  /**
   * Internal method: create a wallet for a staff profile.
   * Called by InviteService during invite acceptance (no user context).
   * Idempotent — returns existing wallet if one already exists.
   */
  async createStaffWallet(staffProfileId: string, currency?: string): Promise<Wallet> {
    // Idempotent: check if wallet already exists for this staff profile
    const existing = await this.walletRepository.findOne({
      where: { ownerId: staffProfileId, ownerType: 'staff' },
    });

    if (existing) {
      this.logger.log(`Wallet already exists for staff profile ${staffProfileId}, reusing`);
      return existing;
    }

    const wallet = this.walletRepository.create({
      ownerId: staffProfileId,
      ownerType: 'staff',
      balanceAvailable: 0,
      balancePending: 0,
      balanceProcessing: 0,
      currency: currency || 'NGN',
      reference: await this.generateWalletReference(),
    } as Partial<Wallet>);

    const saved = await this.walletRepository.save(wallet);
    this.logger.log(`Staff wallet created for profile ${staffProfileId} (id: ${saved.id}, ref: ${saved.reference})`);
    return saved;
  }

  /**
   * Internal method: create a wallet for a customer profile.
   * Called lazily on first deposit (no user context for role checks).
   * Idempotent — returns existing wallet if one already exists.
   */
  async createCustomerWallet(customerProfileId: string, currency?: string): Promise<Wallet> {
    const existing = await this.walletRepository.findOne({
      where: { ownerId: customerProfileId, ownerType: 'customer' },
    });

    if (existing) {
      this.logger.log(`Wallet already exists for customer profile ${customerProfileId}, reusing`);
      return existing;
    }

    const wallet = this.walletRepository.create({
      ownerId: customerProfileId,
      ownerType: 'customer',
      balanceAvailable: 0,
      balancePending: 0,
      balanceProcessing: 0,
      currency: currency || 'NGN',
      reference: await this.generateWalletReference(),
    } as Partial<Wallet>);

    const saved = await this.walletRepository.save(wallet);
    this.logger.log(`Customer wallet created for profile ${customerProfileId} (id: ${saved.id}, ref: ${saved.reference})`);
    return saved;
  }

  /**
   * Find the customer wallet for a given customer profile ID.
   * Returns null if no wallet exists yet.
   */
  async findCustomerWallet(customerProfileId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({
      where: { ownerId: customerProfileId, ownerType: 'customer' },
    });
  }

  /**
   * Get the customer wallet for a given customer profile ID, or throw.
   */
  async getCustomerWallet(customerProfileId: string): Promise<Wallet> {
    const wallet = await this.findCustomerWallet(customerProfileId);
    if (!wallet) {
      throw new NotFoundException(
        'Customer wallet not found. Make a deposit first to create your wallet.',
      );
    }
    return wallet;
  }

  /**
   * Get or create a wallet for a customer profile (idempotent).
   * Convenience method used by the customer wallet controller.
   */
  async getOrCreateCustomerWallet(customerProfileId: string, currency?: string): Promise<Wallet> {
    const existing = await this.findCustomerWallet(customerProfileId);
    if (existing) {
      return existing;
    }
    return this.createCustomerWallet(customerProfileId, currency);
  }

  /**
   * Find a staff wallet by staff profile ID.
   * Returns null if no wallet exists yet.
   */
  async findStaffWallet(staffProfileId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({
      where: { ownerId: staffProfileId, ownerType: 'staff', status: EntityStatus.ACTIVE },
    });
  }

  /**
   * Get a staff wallet by staff profile ID, or throw.
   */
  async getStaffWallet(staffProfileId: string): Promise<Wallet> {
    const wallet = await this.findStaffWallet(staffProfileId);
    if (!wallet) {
      throw new NotFoundException('Staff wallet not found');
    }
    return wallet;
  }

  /**
   * Internal method: get or create the platform fee collection wallet.
   * This wallet collects 5% of all internal tip-from-balance transactions.
   */
  async getOrCreatePlatformWallet(): Promise<Wallet> {
    const existing = await this.walletRepository.findOne({
      where: { ownerId: PLATFORM_WALLET_OWNER_ID, ownerType: PLATFORM_WALLET_OWNER_TYPE },
    });

    if (existing) {
      return existing;
    }

    const wallet = this.walletRepository.create({
      ownerId: PLATFORM_WALLET_OWNER_ID,
      ownerType: PLATFORM_WALLET_OWNER_TYPE,
      balanceAvailable: 0,
      balancePending: 0,
      balanceProcessing: 0,
      currency: 'NGN',
      reference: await this.generateWalletReference(),
    } as Partial<Wallet>);

    const saved = await this.walletRepository.save(wallet);
    this.logger.log(`Platform fee wallet created (id: ${saved.id}, ref: ${saved.reference})`);
    return saved;
  }

  /**
   * Internal method: tip a staff member from a customer's wallet balance.
   * Atomically debits the customer wallet and credits the staff wallet.
   * A 5% platform fee is deducted and credited to the platform wallet.
   *
   * Returns three transactions: TIP_OUT (customer), TIP_IN (staff), FEE (platform).
   */
  async tipFromBalance(
    customerWalletId: string,
    staffWalletId: string,
    amount: number,
  ): Promise<{ tipOutTx: Transaction; tipInTx: Transaction; feeTx: Transaction }> {
    if (customerWalletId === staffWalletId) {
      throw new BadRequestException('Cannot tip yourself');
    }

    const netAmount = Math.round((amount * (1 - PLATFORM_FEE_PERCENT)) * 100) / 100;
    const feeAmount = Math.round((amount * PLATFORM_FEE_PERCENT) * 100) / 100;

    const refTipOut = this.generateReference('TIP_OUT');
    const refTipIn = this.generateReference('TIP_IN');
    const refFee = this.generateReference('FEE');

    const platformWallet = await this.getOrCreatePlatformWallet();

    return this.walletRepository.manager.transaction(async (entityManager) => {
      // 0. Capture pre-update balances for correct ledger snapshots
      const customerBefore = await entityManager.findOne(Wallet, {
        where: { id: customerWalletId },
      });
      const staffBefore = await entityManager.findOne(Wallet, {
        where: { id: staffWalletId },
      });
      const platformBefore = await entityManager.findOne(Wallet, {
        where: { id: platformWallet.id },
      });

      const customerBal = customerBefore?.balanceAvailable ?? 0;
      const staffBal = staffBefore?.balanceAvailable ?? 0;
      const platformBal = platformBefore?.balanceAvailable ?? 0;

      // 1. Debit customer wallet (atomic guard)
      const customerResult: any[] = await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) - $1 WHERE "id" = $2 AND "balance_available" >= $1',
        [amount, customerWalletId],
      );

      if (customerResult.length === 0) {
        throw new BadRequestException('Insufficient balance in customer wallet');
      }

      // 2. Credit staff wallet (atomic increment)
      await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [netAmount, staffWalletId],
      );

      // 3. Credit platform wallet with fee (atomic increment)
      await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [feeAmount, platformWallet.id],
      );

      // 4. Record three transactions with correct pre/post balance snapshots
      const tipOutTx = entityManager.create(Transaction, {
        walletId: customerWalletId,
        type: TransactionType.TIP_OUT,
        amount,
        fee: feeAmount,
        netAmount,
        reference: refTipOut,
        description: 'Tip to staff',
        transactionStatus: TransactionStatus.COMPLETED,
        balanceBefore: customerBal,
        balanceAfter: customerBal - amount,
      });

      const tipInTx = entityManager.create(Transaction, {
        walletId: staffWalletId,
        type: TransactionType.TIP_IN,
        amount: netAmount,
        fee: 0,
        reference: refTipIn,
        description: 'Tip received from customer',
        transactionStatus: TransactionStatus.COMPLETED,
        balanceBefore: staffBal,
        balanceAfter: staffBal + netAmount,
      });

      const feeTx = entityManager.create(Transaction, {
        walletId: platformWallet.id,
        type: TransactionType.FEE,
        amount: feeAmount,
        fee: 0,
        reference: refFee,
        description: 'Platform fee on tip',
        transactionStatus: TransactionStatus.COMPLETED,
        balanceBefore: platformBal,
        balanceAfter: platformBal + feeAmount,
      });

      await entityManager.save(tipOutTx);
      await entityManager.save(tipInTx);
      await entityManager.save(feeTx);

      this.logger.log(
        `Tip of ${amount} from wallet ${customerWalletId} to ${staffWalletId} ` +
        `(net: ${netAmount}, fee: ${feeAmount})`,
      );

      return { tipOutTx, tipInTx, feeTx };
    });
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
   * GET /merchant/wallet
   * Convenience method: look up the merchant by the authenticated user's ID,
   * then fetch (or auto-create) the merchant's wallet.  Handles the indirection
   * where wallet.ownerId = merchant.id (not user.sub).
   *
   * Idempotent — returns existing wallet if one already exists.
   */
  async getOrCreateMerchantWallet(
    user: { sub: string; role: Role },
  ): Promise<Wallet> {
    const merchant = await this.walletRepository.manager.findOne(Merchant, {
      where: { ownerId: user.sub },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found for this user');
    }

    // Check for existing wallet first (idempotent)
    const existing = await this.walletRepository.findOne({
      where: { ownerId: merchant.id, ownerType: 'merchant' },
    });
    if (existing) {
      return existing;
    }

    // Auto-create a wallet for this merchant
    const wallet = this.walletRepository.create({
      ownerId: merchant.id,
      ownerType: 'merchant',
      balanceAvailable: 0,
      balancePending: 0,
      balanceProcessing: 0,
      currency: merchant.currency || 'NGN',
      reference: await this.generateWalletReference(),
    } as Partial<Wallet>);

    const saved = await this.walletRepository.save(wallet);
    this.logger.log(`Merchant wallet auto-created for merchant ${merchant.id} (id: ${saved.id}, ref: ${saved.reference})`);
    return saved;
  }

  /**
   * GET /staff/wallet
   * Fetch all wallets belonging to a staff user across all merchants they
   * work for.  Returns consolidated balances with merchant names.
   */
  async getStaffConsolidatedWallets(
    user: { sub: string; role: Role },
  ): Promise<StaffConsolidatedWalletsDto> {
    // Find all StaffProfiles linked to this user
    const staffProfiles = await this.staffProfileRepository.find({
      where: { userId: user.sub },
      relations: ['merchant'],
    });

    // Look up wallets for each StaffProfile
    const walletPromises = staffProfiles.map(async (profile) => {
      const wallet = await this.walletRepository.findOne({
        where: { ownerId: profile.id, ownerType: 'staff' },
      });
      return {
        id: wallet?.id || null,
        merchantName: profile.merchant?.name || 'Unknown',
        merchantShortCode: profile.merchant?.shortCode || '',
        balanceAvailable: wallet ? Number(wallet.balanceAvailable) : 0,
        balancePending: wallet ? Number(wallet.balancePending) : 0,
        balanceProcessing: wallet ? Number(wallet.balanceProcessing) : 0,
        reference: wallet?.reference || null,
      };
    });

    const wallets = await Promise.all(walletPromises);

    const totalBalances = wallets.reduce(
      (acc, w) => ({
        balanceAvailable: acc.balanceAvailable + w.balanceAvailable,
        balancePending: acc.balancePending + w.balancePending,
        balanceProcessing: acc.balanceProcessing + w.balanceProcessing,
      }),
      { balanceAvailable: 0, balancePending: 0, balanceProcessing: 0 },
    );

    return { wallets, totalBalances };
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
    query: TransactionHistoryQueryDto,
  ): Promise<TransactionsListDto> {
    // Enforce ownership: look up wallet, then assert ownership
    const wallet = await this.getWalletById(walletId, user);
    // Ownership is enforced inside getWalletById

    const page = query.page || 1;
    const limit = query.limit || 20;

    // Build dynamic WHERE clause — only include filters that are provided
    const where: FindOptionsWhere<Transaction> = { walletId: wallet.id };
    if (query.type !== undefined) where.type = query.type;
    if (query.status !== undefined) where.transactionStatus = query.status;

    return this.paginationService.paginate(
      this.transactionRepository,
      where,
      page,
      limit,
      { order: { createdAt: 'DESC' } },
    );
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