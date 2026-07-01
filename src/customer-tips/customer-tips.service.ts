import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Tip } from '../tips/entities/tip.entity';
import { TipSource } from '../tips/enums/tip-source.enum';
import { TipStatus } from '../tips/enums/tip-status.enum';
import { TipResponseDto } from '../tips/dto/tip-response.dto';
import { C2cTipFundingSource } from '../tips/enums/c2c-tip-funding-source.enum';
import { C2cTipSenderType } from '../tips/enums/c2c-tip-sender-type.enum';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { CustomerService } from '../customer/customer.service';
import { WalletService } from '../wallet/wallet.service';
import { Wallet } from '../wallet/entities/wallet.entity';
import { PaymentProvider } from '../payments/providers/interfaces/payment-provider.interface';
import { Payment } from '../payments/entities/payment.entity';
import { Role } from '../auth/enums/role.enum';
import { User } from '../auth/entities/user.entity';
import { MailService } from '../auth/services/mail.service';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import {
  SendCustomerTipDto,
  SearchCustomersQueryDto,
} from './dto/send-customer-tip.dto';
import { ExportTipsQueryDto } from './dto/export-tips-query.dto';
import { PaginationService, PaginatedResult } from '../common/pagination';
import { TipHistoryQueryDto, TipDirection, TipPeriod, TipStatusFilter } from './dto/tip-history-query.dto';

/**
 * Maximum tip amount per transaction (user-defined limit).
 */
const MAX_TIP_AMOUNT = 50_000;

/**
 * KYC threshold: cumulative received tips before KYC is required.
 */
const KYC_THRESHOLD = 100_000;

@Injectable()
export class CustomerTipsService {
  private readonly logger = new Logger(CustomerTipsService.name);

  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    private readonly customerService: CustomerService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Send a C2C tip — two paths:
   *  - WALLET: atomically debit sender, credit recipient (instant)
   *  - CARD:   create PENDING tip + payment, return checkout URL
   */
  async sendTip(
    user: { sub: string; role: Role },
    dto: SendCustomerTipDto,
    paymentProvider?: PaymentProvider,
  ): Promise<{
    tip: Tip;
    authorizationUrl?: string;
    reference?: string;
  }> {
    // ── Self-tip guard ──
    const senderProfile = await this.customerService.getByUserId(user.sub);
    if (senderProfile.id === dto.recipientProfileId) {
      throw new BadRequestException('Cannot send a tip to yourself');
    }

    // ── Validate recipient exists ──
    const recipientProfile = await this.customerProfileRepository.findOne({
      where: { id: dto.recipientProfileId },
    });
    if (!recipientProfile) {
      throw new NotFoundException('Recipient customer profile not found');
    }

    // ── Validate amount ──
    if (dto.amount <= 0) {
      throw new BadRequestException('Tip amount must be greater than zero');
    }
    if (dto.amount > MAX_TIP_AMOUNT) {
      throw new BadRequestException(`Tip amount cannot exceed ${MAX_TIP_AMOUNT}`);
    }

    // ── Check KYC threshold for recipient ──
    await this.checkKycThreshold(recipientProfile.id);

    // ── Route by funding source ──
    if (dto.fundingSource === C2cTipFundingSource.WALLET) {
      return this.sendTipFromWallet(senderProfile, recipientProfile, dto);
    } else if (dto.fundingSource === C2cTipFundingSource.CARD) {
      if (!paymentProvider) {
        throw new BadRequestException('Card payment is not available');
      }
      return this.sendTipFromCard(senderProfile, recipientProfile, dto, paymentProvider);
    }

    throw new BadRequestException('Invalid funding source');
  }

  /**
   * Wallet-funded C2C tip: instant atomic transfer via WalletService.tipFromBalance.
   */
  private async sendTipFromWallet(
    senderProfile: CustomerProfile,
    recipientProfile: CustomerProfile,
    dto: SendCustomerTipDto,
  ): Promise<{ tip: Tip }> {
    // Resolve wallets
    const senderWallet = await this.walletService.getOrCreateCustomerWallet(senderProfile.id);
    const recipientWallet = await this.walletService.getOrCreateCustomerWallet(recipientProfile.id);

    // Execute atomic transfer via the existing wallet service
    const { tipOutTx } = await this.walletService.tipFromBalance(
      senderWallet.id,
      recipientWallet.id,
      dto.amount,
    );

    // Create the C2C tip record
    const tip = this.tipRepository.create({
      merchantId: senderProfile.id, // Use sender's profile as context
      staffProfileId: recipientProfile.id, // "staff" field repurposed for recipient
      customerProfileId: senderProfile.id, // Track who initiated
      amount: dto.amount,
      currency: 'NGN',
      message: dto.message || null,
      source: TipSource.CUSTOMER_TO_CUSTOMER,
      tipStatus: TipStatus.COMPLETED,
      senderId: senderProfile.id,
      senderType: C2cTipSenderType.CUSTOMER,
      recipientType: 'customer',
      fundingSource: C2cTipFundingSource.WALLET,
      senderWalletId: senderWallet.id,
      transactionId: tipOutTx.id,
    });

    const savedTip = await this.tipRepository.save(tip);

    // Notify recipient via email (fire-and-forget)
    this.notifyTipReceived(savedTip, recipientProfile, senderProfile.displayName || 'A customer').catch(
      (err: Error) => this.logger.error(`Failed to send tip notification email: ${err.message}`, err.stack),
    );

    this.logger.log(
      `C2C tip ${savedTip.id}: ${senderProfile.id} → ${recipientProfile.id}, ` +
      `amount: ${dto.amount}, wallet-funded (tx: ${tipOutTx.id})`,
    );

    return { tip: savedTip };
  }

  /**
   * Card-funded C2C tip: create PENDING tip + payment, return checkout URL.
   */
  private async sendTipFromCard(
    senderProfile: CustomerProfile,
    recipientProfile: CustomerProfile,
    dto: SendCustomerTipDto,
    paymentProvider: PaymentProvider,
  ): Promise<{ tip: Tip; authorizationUrl: string; reference: string }> {
    // Create PENDING tip record
    const tip = this.tipRepository.create({
      merchantId: senderProfile.id,
      staffProfileId: recipientProfile.id,
      customerProfileId: senderProfile.id,
      amount: dto.amount,
      currency: 'NGN',
      message: dto.message || null,
      source: TipSource.CUSTOMER_TO_CUSTOMER,
      tipStatus: TipStatus.PENDING,
      senderId: senderProfile.id,
      senderType: C2cTipSenderType.CUSTOMER,
      recipientType: 'customer',
      fundingSource: C2cTipFundingSource.CARD,
      senderWalletId: null,
    });

    const savedTip = await this.tipRepository.save(tip);

    // Get sender email from user record
    const senderUser = await this.userRepository.findOne({
      where: { id: senderProfile.userId },
    });
    const email = senderUser?.email || 'customer@taktip.com';

    // Initialize Paystack transaction
    const result = await paymentProvider.initializeTransaction({
      email,
      amount: dto.amount,
      currency: 'NGN',
      metadata: {
        tipId: savedTip.id,
        senderId: senderProfile.id,
        recipientId: recipientProfile.id,
        isCustomerToCustomer: true,
        fundingSource: 'card',
      },
    });

    // Link payment to tip
    await this.paymentRepository.update(
      { reference: result.reference },
      { tipId: savedTip.id },
    );

    this.logger.log(
      `C2C tip ${savedTip.id}: ${senderProfile.id} → ${recipientProfile.id}, ` +
      `amount: ${dto.amount}, card-funded (ref: ${result.reference})`,
    );

    return {
      tip: savedTip,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    };
  }

  /**
   * Check if the recipient has reached the KYC threshold.
   * Flags for review if cumulative received tips >= KYC_THRESHOLD.
   * Currently warns — does not block.
   */
  private async checkKycThreshold(recipientProfileId: string): Promise<void> {
    const rawResult = await this.tipRepository
      .createQueryBuilder('tip')
      .select('SUM(tip.amount)', 'total')
      .where('tip.staff_profile_id = :recipientId', { recipientId: recipientProfileId })
      .andWhere('tip.recipient_type = :type', { type: 'customer' })
      .andWhere('tip.tip_status = :status', { status: TipStatus.COMPLETED })
      .getRawOne() as unknown as { total: string | null } | undefined;

    const totalReceived = rawResult?.total ? Number(rawResult.total) : 0;

    if (totalReceived >= KYC_THRESHOLD) {
      this.logger.warn(
        `Recipient ${recipientProfileId} has received ₦${totalReceived} in C2C tips ` +
        `(threshold: ₦${KYC_THRESHOLD}). KYC verification may be required.`,
      );
      // TODO: Integrate with KYC service when available
    }
  }

  /**
   * Search for customers by name or email.
   * Searches across display_name, user first_name, last_name, and email.
   */
  async searchCustomers(
    query: SearchCustomersQueryDto,
  ): Promise<{ id: string; displayName: string; avatar: string | null; email: string }[]> {
    const limit = query.limit ?? 20;
    const searchTerm = `%${query.q}%`;

    // Search via raw query for cross-table search
    const results = await this.customerProfileRepository
      .createQueryBuilder('cp')
      .innerJoinAndSelect('cp.user', 'u')
      .where('cp.display_name ILIKE :term', { term: searchTerm })
      .orWhere('u.firstName ILIKE :term', { term: searchTerm })
      .orWhere('u.lastName ILIKE :term', { term: searchTerm })
      .orWhere('u.email ILIKE :term', { term: searchTerm })
      .select([
        'cp.id',
        'cp.displayName',
        'cp.avatar',
        'u.email',
        'u.firstName',
        'u.lastName',
      ])
      .take(limit)
      .getMany();

    return results.map((cp) => ({
      id: cp.id,
      displayName: cp.displayName || `${cp.user.firstName || ''} ${cp.user.lastName || ''}`.trim() || 'Unknown',
      avatar: cp.avatar,
      email: cp.user.email,
    }));
  }

  // ── Name enrichment helpers ──────────────────────────────────────────────

  /**
   * Build a customerProfileId → CustomerProfile lookup map.
   */
  private async buildCustomerProfileMap(
    ids: Set<string>,
  ): Promise<Map<string, CustomerProfile>> {
    if (ids.size === 0) return new Map();
    const profiles = await this.customerProfileRepository.find({
      where: { id: In([...ids]) },
      relations: ['user'],
    });
    return new Map(profiles.map((p) => [p.id, p]));
  }

  /**
   * Build a staffProfileId → StaffProfile lookup map.
   */
  private async buildStaffProfileMap(
    ids: Set<string>,
  ): Promise<Map<string, StaffProfile>> {
    if (ids.size === 0) return new Map();
    const profiles = await this.staffProfileRepository.find({
      where: { id: In([...ids]) },
      relations: ['user'],
    });
    return new Map(profiles.map((p) => [p.id, p]));
  }

  /**
   * Build a merchantId → merchant.name lookup map.
   */
  private async buildMerchantNameMap(
    ids: Set<string>,
  ): Promise<Map<string, string>> {
    if (ids.size === 0) return new Map();
    const merchants = await this.merchantRepository.find({
      where: { id: In([...ids]) },
    });
    return new Map(merchants.map((m) => [m.id, m.name]));
  }

  /**
   * Map a raw Tip into an enriched TipResponseDto.
   *
   * Rules for senderName / recipientName:
   * ─────────────────────────────────────────────────────────
   * | Tip type         | senderName                | recipientName         |
   * |──────────────────|───────────────────────────|───────────────────────|
   * | Staff (GUEST)    | "Guest"                   | StaffProfile → name   |
   * | Staff (WALLET)   | CustomerProfile → name    | StaffProfile → name   |
   * | C2C              | senderId → Customer       | staffProfileId        |
   * |                  |   Profile → name          |   → CustomerProfile   |
   * |                  |                           |   → name              |
   * ───────────────────────────────────────────────────────────────────────
   */
  private tipToDto(
    tip: Tip,
    customerProfileMap: Map<string, CustomerProfile>,
    staffProfileMap: Map<string, StaffProfile>,
    merchantNameMap: Map<string, string>,
  ): TipResponseDto {
    // ── Resolve senderName ──
    let senderName: string | undefined;
    if (tip.source === TipSource.CUSTOMER_TO_CUSTOMER) {
      // C2C tip: senderId identifies the sender
      if (tip.senderId) {
        const profile = customerProfileMap.get(tip.senderId);
        senderName = profile
          ? profile.displayName || profile.user?.firstName || 'Unknown'
          : 'Unknown';
      } else {
        senderName = 'Unknown';
      }
    } else if (!tip.customerProfileId) {
      // Guest tip (no customer profile)
      senderName = 'Guest';
    } else {
      // Staff tip with registered customer
      const profile = customerProfileMap.get(tip.customerProfileId);
      senderName = profile
        ? profile.displayName || profile.user?.firstName || 'Unknown'
        : 'Unknown';
    }

    // ── Resolve recipientName ──
    let recipientName: string | undefined;
    if (tip.recipientType === 'customer') {
      // C2C tip: staffProfileId is repurposed for recipient
      const profile = customerProfileMap.get(tip.staffProfileId);
      recipientName = profile
        ? profile.displayName || profile.user?.firstName || 'Unknown'
        : 'Unknown';
    } else {
      // Staff tip: staffProfileId identifies the staff member
      const profile = staffProfileMap.get(tip.staffProfileId);
      if (profile) {
        recipientName = profile.displayName || profile.user?.firstName || 'Unknown Staff';
      } else {
        recipientName = 'Unknown';
      }
    }

    return {
      id: tip.id,
      amount: Number(tip.amount),
      currency: tip.currency,
      message: tip.message || undefined,
      rating: tip.rating ?? undefined,
      createdAt: tip.createdAt,
      senderName,
      recipientName,
      merchantName: merchantNameMap.get(tip.merchantId) || undefined,
      merchantId: tip.merchantId || undefined,
      staffProfileId: tip.staffProfileId || undefined,
      customerProfileId: tip.customerProfileId || undefined,
      qrCodeId: tip.qrCodeId || undefined,
      source: tip.source,
      tipStatus: tip.tipStatus,
      recipientType: tip.recipientType || undefined,
    };
  }

  /**
   * Enrich an array of tips with names and return TipResponseDto[].
   */
  private async enrichTips(
    tips: Tip[],
  ): Promise<TipResponseDto[]> {
    if (tips.length === 0) return [];

    // Collect all profile IDs we need to look up
    const customerProfileIds = new Set<string>();
    const staffProfileIds = new Set<string>();
    const merchantIds = new Set<string>();

    for (const t of tips) {
      if (t.source === TipSource.CUSTOMER_TO_CUSTOMER) {
        if (t.senderId) customerProfileIds.add(t.senderId);
        // staffProfileId is the C2C recipient
        customerProfileIds.add(t.staffProfileId);
      } else {
        if (t.customerProfileId) customerProfileIds.add(t.customerProfileId);
        staffProfileIds.add(t.staffProfileId);
        if (t.merchantId) merchantIds.add(t.merchantId);
      }
    }

    const [customerProfileMap, staffProfileMap, merchantNameMap] = await Promise.all([
      this.buildCustomerProfileMap(customerProfileIds),
      this.buildStaffProfileMap(staffProfileIds),
      this.buildMerchantNameMap(merchantIds),
    ]);

    return tips.map((t) => this.tipToDto(t, customerProfileMap, staffProfileMap, merchantNameMap));
  }

  /**
   * Get tip history for the current customer.
   *
   * Returns a single paginated, chronologically-sorted list of ALL tips
   * associated with the customer (both sent and received), with optional
   * server-side filtering by direction, time period, and tip status.
   *
   * Items are enriched with human-readable names (senderName, recipientName, merchantName).
   */
  /**
   * Export tip history as CSV for the current customer.
   * Applies the same filters as getMyTipHistory but returns all matching
   * rows (unpaginated) formatted as CSV text.
   */
  async exportTipsToCsv(
    user: { sub: string; role: Role },
    query: ExportTipsQueryDto,
  ): Promise<string> {
    const profile = await this.customerService.getByUserId(user.sub);
    const direction = query.direction ?? TipDirection.ALL;
    const period = query.period ?? TipPeriod.ALL;
    const status = query.status ?? TipStatusFilter.ALL;

    // ── Build dynamic query (same filters as getMyTipHistory) ──
    const queryBuilder = this.tipRepository
      .createQueryBuilder('tip')
      .orderBy('tip.createdAt', 'DESC');

    // Direction
    switch (direction) {
      case TipDirection.SENT:
        queryBuilder.andWhere(
          '(tip.customerProfileId = :profileId OR (tip.senderId = :profileId AND tip.recipientType = :customerType))',
          { profileId: profile.id, customerType: 'customer' },
        );
        break;
      case TipDirection.RECEIVED:
        queryBuilder.andWhere(
          '(tip.staffProfileId = :profileId AND tip.recipientType = :customerType)',
          { profileId: profile.id, customerType: 'customer' },
        );
        break;
      case TipDirection.ALL:
      default:
        queryBuilder.andWhere(
          '(tip.customerProfileId = :profileId OR tip.staffProfileId = :profileId OR (tip.senderId = :profileId AND tip.recipientType = :customerType))',
          { profileId: profile.id, customerType: 'customer' },
        );
        break;
    }

    // Period
    if (period !== TipPeriod.ALL) {
      const days =
        period === TipPeriod.SEVEN_DAYS
          ? 7
          : period === TipPeriod.THIRTY_DAYS
            ? 30
            : 90;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      queryBuilder.andWhere('tip.createdAt >= :cutoff', { cutoff });
    }

    // Status
    if (status !== TipStatusFilter.ALL) {
      const tipStatusMap: Record<string, number> = {
        [TipStatusFilter.COMPLETED]: TipStatus.COMPLETED,
        [TipStatusFilter.PENDING]: TipStatus.PENDING,
        [TipStatusFilter.REFUNDED]: TipStatus.REFUNDED,
        [TipStatusFilter.FAILED]: TipStatus.FAILED,
      };
      queryBuilder.andWhere('tip.tipStatus = :tipStatus', {
        tipStatus: tipStatusMap[status],
      });
    }

    const tips = await queryBuilder.getMany();

    // Enrich with names
    const enriched = await this.enrichTips(tips);

    // ── Build CSV ──
    const HEADERS = [
      'ID',
      'Date',
      'Type',
      'Direction',
      'Sender',
      'Recipient',
      'Merchant',
      'Amount',
      'Currency',
      'Status',
      'Message',
    ];

    const TYPE_LABELS: Record<number, string> = {
      [TipSource.GUEST]: 'Guest Tip',
      [TipSource.WALLET]: 'Wallet Tip',
      [TipSource.CUSTOMER_TO_CUSTOMER]: 'C2C Tip',
    };

    const STATUS_LABELS: Record<number, string> = {
      [TipStatus.COMPLETED]: 'Completed',
      [TipStatus.PENDING]: 'Pending',
      [TipStatus.REFUNDED]: 'Refunded',
      [TipStatus.FAILED]: 'Failed',
    };

    const escapeCsv = (val: string | undefined | null): string => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = enriched.map((t) => [
      escapeCsv(t.id),
      escapeCsv(t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt)),
      escapeCsv(TYPE_LABELS[t.source] || `Source(${t.source})`),
      escapeCsv(t.senderName === 'Guest' ? 'Received' : t.customerProfileId ? 'Sent' : 'Received'),
      escapeCsv(t.senderName),
      escapeCsv(t.recipientName),
      escapeCsv(t.merchantName),
      String(t.amount),
      escapeCsv(t.currency),
      escapeCsv(STATUS_LABELS[t.tipStatus] || `Status(${t.tipStatus})`),
      escapeCsv(t.message),
    ].join(','));

    return [HEADERS.join(','), ...rows].join('\n');
  }

  async getMyTipHistory(
    user: { sub: string; role: Role },
    query: TipHistoryQueryDto,
  ): Promise<PaginatedResult<TipResponseDto>> {
    const profile = await this.customerService.getByUserId(user.sub);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const direction = query.direction ?? TipDirection.ALL;
    const period = query.period ?? TipPeriod.ALL;
    const status = query.status ?? TipStatusFilter.ALL;

    // ── Build dynamic query ──────────────────────────────────────────────────
    const queryBuilder = this.tipRepository
      .createQueryBuilder('tip')
      .skip(this.paginationService.getSkip(page, limit))
      .take(limit)
      .orderBy('tip.createdAt', 'DESC');

    // Direction
    switch (direction) {
      case TipDirection.SENT:
        queryBuilder.andWhere(
          '(tip.customerProfileId = :profileId OR (tip.senderId = :profileId AND tip.recipientType = :customerType))',
          { profileId: profile.id, customerType: 'customer' },
        );
        break;
      case TipDirection.RECEIVED:
        queryBuilder.andWhere(
          '(tip.staffProfileId = :profileId AND tip.recipientType = :customerType)',
          { profileId: profile.id, customerType: 'customer' },
        );
        break;
      case TipDirection.ALL:
      default:
        queryBuilder.andWhere(
          '(tip.customerProfileId = :profileId OR tip.staffProfileId = :profileId OR (tip.senderId = :profileId AND tip.recipientType = :customerType))',
          { profileId: profile.id, customerType: 'customer' },
        );
        break;
    }

    // Period — use JS-calculated date to avoid INTERVAL param-binding issues
    if (period !== TipPeriod.ALL) {
      const days =
        period === TipPeriod.SEVEN_DAYS
          ? 7
          : period === TipPeriod.THIRTY_DAYS
            ? 30
            : 90;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      queryBuilder.andWhere('tip.createdAt >= :cutoff', { cutoff });
    }

    // Status
    if (status !== TipStatusFilter.ALL) {
      const tipStatusMap: Record<string, number> = {
        [TipStatusFilter.COMPLETED]: TipStatus.COMPLETED,
        [TipStatusFilter.PENDING]: TipStatus.PENDING,
        [TipStatusFilter.REFUNDED]: TipStatus.REFUNDED,
        [TipStatusFilter.FAILED]: TipStatus.FAILED,
      };
      queryBuilder.andWhere('tip.tipStatus = :tipStatus', {
        tipStatus: tipStatusMap[status],
      });
    }

    // ── Execute ──
    const [tips, total] = await queryBuilder.getManyAndCount();

    // ── Enrich with names ──
    const enriched = await this.enrichTips(tips);

    return this.paginationService.wrap(enriched, total, page, limit);
  }

  /**
   * Send an email notification to the tip recipient.
   * Fire-and-forget — caller handles error logging.
   */
  private async notifyTipReceived(
    tip: Tip,
    recipient: CustomerProfile,
    senderDisplayName: string,
  ): Promise<void> {
    const recipientUser = await this.userRepository.findOne({
      where: { id: recipient.userId },
    });
    if (!recipientUser?.email) {
      this.logger.warn(`Cannot notify recipient ${recipient.id}: no email found`);
      return;
    }

    await this.mailService.sendTipReceivedEmail(
      recipientUser.email,
      senderDisplayName,
      tip.amount,
    );
  }
}
