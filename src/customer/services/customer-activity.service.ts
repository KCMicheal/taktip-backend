import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tip } from '../../tips/entities/tip.entity';
import { TipSource } from '../../tips/enums/tip-source.enum';
import { TipStatus } from '../../tips/enums/tip-status.enum';
import { Transaction } from '../../wallet/entities/transaction.entity';
import { TransactionType } from '../../wallet/enums/transaction-type.enum';
import { TransactionStatus } from '../../wallet/enums/transaction-status.enum';
import { Wallet } from '../../wallet/entities/wallet.entity';
import { CustomerProfile } from '../entities/customer-profile.entity';
import { StaffProfile } from '../../staff/entities/staff-profile.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { CustomerService } from '../customer.service';
import { PaginationService, PaginatedResult } from '../../common/pagination';
import { ActivityQueryDto, ActivityType, ActivityPeriod } from '../dto/activity-query.dto';

/**
 * Unified activity item returned by the activity feed.
 * Represents any meaningful action on the customer side:
 * tips (sent/received), deposits, withdrawals, transfers, fees, etc.
 */
export interface ActivityItem {
  id: string;
  source: 'tip' | 'transaction';
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  counterparty: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

@Injectable()
export class CustomerActivityService {
  private readonly logger = new Logger(CustomerActivityService.name);

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    private readonly customerService: CustomerService,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Get unified activity feed for the authenticated customer.
   *
   * Merges tips and wallet transactions into a single chronological list,
   * normalized to a common shape. Supports filtering by source type and
   * time period with standard pagination.
   */
  async getActivity(
    userId: string,
    query: ActivityQueryDto,
  ): Promise<PaginatedResult<ActivityItem>> {
    const profile = await this.customerService.getByUserId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const type = query.type ?? ActivityType.ALL;
    const period = query.period ?? ActivityPeriod.ALL;

    const cutoff = this.getCutoffDate(period);

    // Fetch tips and wallet transactions in parallel
    const [tips, transactions] = await Promise.all([
      type === ActivityType.WALLET ? [] : this.fetchTips(profile.id, cutoff),
      type === ActivityType.TIPS ? [] : this.fetchTransactions(profile.id, cutoff),
    ]);

    // Normalize both sources to a common shape
    const tipItems = tips.map((t) => this.tipToActivity(t, profile.id));
    const txItems = transactions.map((tx) => this.txToActivity(tx));

    // Merge, sort by date descending, paginate
    const all = [...tipItems, ...txItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = all.length;
    const skip = this.paginationService.getSkip(page, limit);
    const items = all.slice(skip, skip + limit);

    return this.paginationService.wrap(items, total, page, limit);
  }

  // ── Data fetchers ─────────────────────────────────────────────────────────

  /**
   * Fetch all tips where this customer is sender or recipient.
   */
  private async fetchTips(profileId: string, cutoff: Date | null): Promise<Tip[]> {
    const qb = this.tipRepository
      .createQueryBuilder('tip')
      .orderBy('tip.createdAt', 'DESC');

    // Customer is involved as sender, recipient, or customerProfileId holder
    qb.andWhere(
      '(tip.customerProfileId = :profileId OR tip.staffProfileId = :profileId OR (tip.senderId = :profileId AND tip.recipientType = :customerType))',
      { profileId, customerType: 'customer' },
    );

    if (cutoff) {
      qb.andWhere('tip.createdAt >= :cutoff', { cutoff });
    }

    // Fetch a generous batch for merging (no pagination at DB level — we merge first, then paginate)
    qb.limit(500);

    return qb.getMany();
  }

  /**
   * Fetch all wallet transactions for the customer's wallet.
   */
  private async fetchTransactions(profileId: string, cutoff: Date | null): Promise<Transaction[]> {
    const wallet = await this.walletRepository.findOne({
      where: { ownerId: profileId, ownerType: 'customer' },
    });
    if (!wallet) return [];

    const qb = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.walletId = :walletId', { walletId: wallet.id })
      .orderBy('tx.createdAt', 'DESC');

    if (cutoff) {
      qb.andWhere('tx.createdAt >= :cutoff', { cutoff });
    }

    qb.limit(500);

    return qb.getMany();
  }

  // ── Normalizers ───────────────────────────────────────────────────────────

  /**
   * Convert a Tip entity to a normalized ActivityItem.
   */
  private tipToActivity(tip: Tip, currentProfileId: string): ActivityItem {
    const isSender =
      tip.customerProfileId === currentProfileId ||
      tip.senderId === currentProfileId;
    const direction = isSender ? 'sent' : 'received';
    const type = `tip_${direction}`;

    return {
      id: tip.id,
      source: 'tip',
      type,
      amount: Number(tip.amount),
      currency: tip.currency,
      status: this.mapTipStatus(tip.tipStatus),
      description: isSender
        ? `Tipped ${tip.message ? `"${tip.message}"` : 'staff'}`
        : `Received tip${tip.message ? `: "${tip.message}"` : ''}`,
      counterparty: null, // enriched later if needed
      createdAt: tip.createdAt,
      metadata: {
        tipSource: tip.source,
        merchantId: tip.merchantId,
        staffProfileId: tip.staffProfileId,
        message: tip.message,
        rating: tip.rating,
      },
    };
  }

  /**
   * Convert a Transaction entity to a normalized ActivityItem.
   */
  private txToActivity(tx: Transaction): ActivityItem {
    const { type: txType, label } = this.classifyTransaction(tx.type);

    return {
      id: tx.id,
      source: 'transaction',
      type: txType,
      amount: Number(tx.amount),
      currency: 'NGN', // all customer wallets are NGN
      status: this.mapTxStatus(tx.transactionStatus),
      description: tx.description ?? label,
      counterparty: null,
      createdAt: tx.createdAt,
      metadata: {
        reference: tx.reference,
        fee: Number(tx.fee),
        balanceBefore: tx.balanceBefore != null ? Number(tx.balanceBefore) : null,
        balanceAfter: tx.balanceAfter != null ? Number(tx.balanceAfter) : null,
      },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private classifyTransaction(txType: TransactionType): { type: string; label: string } {
    const map: Record<TransactionType, { type: string; label: string }> = {
      [TransactionType.DEPOSIT]: { type: 'deposit', label: 'Wallet deposit' },
      [TransactionType.WITHDRAW]: { type: 'withdrawal', label: 'Withdrawal to bank' },
      [TransactionType.TRANSFER_IN]: { type: 'transfer_in', label: 'Transfer received' },
      [TransactionType.TRANSFER_OUT]: { type: 'transfer_out', label: 'Transfer sent' },
      [TransactionType.TIP_OUT]: { type: 'tip_out', label: 'Tipped staff' },
      [TransactionType.TIP_IN]: { type: 'tip_in', label: 'Tip received' },
      [TransactionType.FEE]: { type: 'fee', label: 'Transaction fee' },
      [TransactionType.CUSTOMER_TIP_OUT]: { type: 'customer_tip_out', label: 'Sent tip to customer' },
      [TransactionType.CUSTOMER_TIP_IN]: { type: 'customer_tip_in', label: 'Received tip from customer' },
    };
    return map[txType] ?? { type: 'unknown', label: 'Transaction' };
  }

  private mapTipStatus(status: TipStatus): string {
    const map: Record<TipStatus, string> = {
      [TipStatus.PENDING]: 'pending',
      [TipStatus.COMPLETED]: 'completed',
      [TipStatus.FAILED]: 'failed',
      [TipStatus.REFUNDED]: 'refunded',
    };
    return map[status] ?? 'unknown';
  }

  private mapTxStatus(status: TransactionStatus): string {
    const map: Record<TransactionStatus, string> = {
      [TransactionStatus.PENDING]: 'pending',
      [TransactionStatus.COMPLETED]: 'completed',
      [TransactionStatus.FAILED]: 'failed',
    };
    return map[status] ?? 'unknown';
  }

  private getCutoffDate(period: ActivityPeriod): Date | null {
    if (period === ActivityPeriod.ALL) return null;
    const days =
      period === ActivityPeriod.SEVEN_DAYS
        ? 7
        : period === ActivityPeriod.THIRTY_DAYS
          ? 30
          : 90;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
