import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Tip } from '../tips/entities/tip.entity';
import { TipStatus } from '../tips/enums/tip-status.enum';
import { TipSource } from '../tips/enums/tip-source.enum';
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
import {
  SendCustomerTipDto,
  SearchCustomersQueryDto,
  TipHistoryQueryDto,
} from './dto/send-customer-tip.dto';

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
    private readonly customerService: CustomerService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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
  ): Promise<{ id: string; displayName: string; avatarUrl: string | null; email: string }[]> {
    const limit = query.limit || 20;
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
        'cp.avatarUrl',
        'u.email',
        'u.firstName',
        'u.lastName',
      ])
      .take(limit)
      .getMany();

    return results.map((cp) => ({
      id: cp.id,
      displayName: cp.displayName || `${cp.user.firstName || ''} ${cp.user.lastName || ''}`.trim() || 'Unknown',
      avatarUrl: cp.avatarUrl,
      email: cp.user.email,
    }));
  }

  /**
   * Get C2C tip history for the current customer.
   * Returns both sent and received tips.
   */
  async getMyTipHistory(
    user: { sub: string; role: Role },
    query: TipHistoryQueryDto,
  ): Promise<{
    sent: Tip[];
    received: Tip[];
    totalSent: number;
    totalReceived: number;
    page: number;
    limit: number;
  }> {
    const profile = await this.customerService.getByUserId(user.sub);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [sent, totalSent] = await this.tipRepository.findAndCount({
      where: { senderId: profile.id, recipientType: 'customer' },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const [received, totalReceived] = await this.tipRepository.findAndCount({
      where: { staffProfileId: profile.id, recipientType: 'customer' },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { sent, received, totalSent, totalReceived, page, limit };
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
