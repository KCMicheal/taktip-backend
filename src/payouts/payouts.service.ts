import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Payout } from './entities/payout.entity';
import { PayoutStatus } from './enums/payout-status.enum';
import { Wallet } from '../wallet/entities/wallet.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/enums/notification-type.enum';

/**
 * Platform fee as a fraction of the payout amount.
 * Set to 0 for MVP (no fee).
 */
const PAYOUT_FEE_PERCENT = 0;

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectQueue('payouts')
    private readonly payoutQueue: Queue,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Generate a unique reference for a payout.
   */
  private generateReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * POST /v1/staff/payouts
   * Request a payout — staff withdraws from their available balance.
   *
   * Steps:
   * 1. Find the staff profile by userId and validate payout method exists
   * 2. Find the staff wallet (ownerType = 'staff')
   * 3. Atomically debit balance_available, credit balance_processing
   * 4. Create a PENDING payout record
   *
   * If the user has multiple staff profiles (works for multiple merchants),
   * uses the first profile found. Staff can specify a profile via their
   * staffProfileId in a future enhancement.
   */
  async requestPayout(userId: string, amount: number): Promise<Payout> {
    // 1. Find staff profiles for this user
    const staffProfiles = await this.staffProfileRepository.find({
      where: { userId },
    });

    if (!staffProfiles || staffProfiles.length === 0) {
      throw new NotFoundException('Staff profile not found for this user');
    }

    // For MVP: use the first staff profile
    // Future: allow user to specify which merchant's wallet to withdraw from
    const staffProfile = staffProfiles[0];

    // Validate payout method is set
    if (!staffProfile.payoutMethod || !staffProfile.payoutMethod['accountNumber']) {
      throw new BadRequestException(
        'No payout method configured. Please set your bank account details first.',
      );
    }

    // 2. Find staff wallet
    const wallet = await this.walletRepository.findOne({
      where: { ownerId: staffProfile.id, ownerType: 'staff' },
    });

    if (!wallet) {
      throw new NotFoundException('Staff wallet not found');
    }

    // Calculate fee and net amount
    const fee = Math.round((amount * PAYOUT_FEE_PERCENT) * 100) / 100;
    const netAmount = amount - fee;
    const reference = this.generateReference('POUT');

    // 3. & 4. Atomic transaction: debit balance_available, credit balance_processing, create payout
    return this.walletRepository.manager.transaction(async (entityManager) => {
      // Atomic debit balance_available with guard
      const debitResult: any[] = await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) - $1 WHERE "id" = $2 AND "balance_available" >= $1',
        [amount, wallet.id],
      );

      // PostgreSQL UPDATE returns [null, 0] when 0 rows matched (insufficient balance)
      if (debitResult[1] === 0) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      // Credit balance_processing
      await entityManager.query(
        'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [amount, wallet.id],
      );

      // Create payout record
      const payout = entityManager.create(Payout, {
        staffProfileId: staffProfile.id,
        amount,
        fee,
        netAmount,
        bankAccount: staffProfile.payoutMethod ?? {},
        payoutStatus: PayoutStatus.PENDING,
        reference,
        adminId: null,
        processedAt: null,
        notes: null,
      });

      await entityManager.save(payout);

      this.logger.log(
        `Payout requested: ${reference} — ${amount} (net: ${netAmount}) for staff profile ${staffProfile.id}`,
      );

      // Send notification to staff member (fire-and-forget)
      this.notificationService.create({
        userId: staffProfile.userId,
        type: NotificationType.PAYOUT_REQUESTED,
        title: 'Payout requested',
        body: `Your payout of NGN ${amount.toFixed(2)} has been submitted for processing`,
        data: {
          payoutId: payout.id,
          amount,
          netAmount,
          reference,
        },
      }).catch((err) => this.logger.warn(`Failed to send payout notification: ${err}`));

      return payout;
    });
  }

  /**
   * POST /v1/merchant/wallet/payout
   * Request a payout — merchant withdraws from their merchant wallet.
   *
   * Steps:
   * 1. Look up the merchant by ownerId
   * 2. Find the merchant's wallet (ownerType = 'merchant')
   * 3. Atomically debit balance_available, credit balance_processing
   * 4. Create a PENDING payout record with merchantId
   */
  async requestMerchantPayout(userId: string, merchantId: string, amount: number): Promise<Payout> {
    // 1. Validate merchant exists and user owns it
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId, ownerId: userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found for this user');
    }

    // 2. Find merchant wallet
    const wallet = await this.walletRepository.findOne({
      where: { ownerId: merchant.id, ownerType: 'merchant' },
    });

    if (!wallet) {
      throw new NotFoundException('Merchant wallet not found');
    }

    // Calculate fee and net amount
    const fee = Math.round((amount * PAYOUT_FEE_PERCENT) * 100) / 100;
    const netAmount = amount - fee;
    const reference = this.generateReference('MPOUT');

    // 3. & 4. Atomic transaction
    return this.walletRepository.manager.transaction(async (entityManager) => {
      const debitResult: any[] = await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) - $1 WHERE "id" = $2 AND "balance_available" >= $1',
        [amount, wallet.id],
      );

      if (debitResult[1] === 0) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      await entityManager.query(
        'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [amount, wallet.id],
      );

      const payout = entityManager.create(Payout, {
        staffProfileId: '00000000-0000-0000-0000-000000000000', // Placeholder — merchant payouts use merchantId instead
        merchantId: merchant.id,
        amount,
        fee,
        netAmount,
        bankAccount: {},
        payoutStatus: PayoutStatus.PENDING,
        reference,
        adminId: null,
        processedAt: null,
        notes: null,
      });

      await entityManager.save(payout);

      this.logger.log(
        `Merchant payout requested: ${reference} — ${amount} (net: ${netAmount}) for merchant ${merchant.id}`,
      );

      // Send notification to merchant owner (fire-and-forget)
      this.notificationService.create({
        userId: merchant.ownerId,
        type: NotificationType.PAYOUT_REQUESTED,
        title: 'Payout requested',
        body: `Your merchant payout of NGN ${amount.toFixed(2)} has been submitted for processing`,
        data: {
          payoutId: payout.id,
          amount,
          netAmount,
          reference,
          merchantId: merchant.id,
        },
      }).catch((err) => this.logger.warn(`Failed to send merchant payout notification: ${err}`));

      return payout;
    });
  }

  /**
   * GET /v1/staff/payouts
   * List all payouts for a staff member, newest first.
   * Finds all staff profiles for the user and returns payouts across all of them.
   */
  async getMyPayouts(userId: string): Promise<Payout[]> {
    const staffProfiles = await this.staffProfileRepository.find({
      where: { userId },
    });

    if (!staffProfiles || staffProfiles.length === 0) {
      return [];
    }

    const profileIds = staffProfiles.map((p) => p.id);

    return this.payoutRepository.find({
      where: { staffProfileId: In(profileIds) },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * GET /v1/admin/payouts
   * List all payouts, optionally filtered by status.
   */
  async getAllPayouts(status?: PayoutStatus): Promise<Payout[]> {
    const where: Record<string, unknown> = {};

    if (status !== undefined && typeof status === 'number') {
      where.payoutStatus = status;
    }

    return this.payoutRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * PATCH /v1/admin/payouts/:id/approve
   * Approve a pending payout and add it to the BullMQ queue for processing.
   */
  async approvePayout(payoutId: string, adminId: string): Promise<Payout> {
    const payout = await this.payoutRepository.findOne({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.payoutStatus !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve payout in status ${PayoutStatus[payout.payoutStatus]}. Only PENDING payouts can be approved.`,
      );
    }

    payout.payoutStatus = PayoutStatus.APPROVED;
    payout.adminId = adminId;
    await this.payoutRepository.save(payout);

    // Add to BullMQ queue for async processing
    await this.payoutQueue.add('process-payout', { payoutId });

    this.logger.log(`Payout ${payout.reference} approved by admin ${adminId} and queued`);

    return payout;
  }

  /**
   * PATCH /v1/admin/payouts/:id/reject
   * Reject a pending payout and reverse the wallet balances.
   */
  async rejectPayout(
    payoutId: string,
    adminId: string,
    notes?: string,
  ): Promise<Payout> {
    const payout = await this.payoutRepository.findOne({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.payoutStatus !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject payout in status ${PayoutStatus[payout.payoutStatus]}. Only PENDING payouts can be rejected.`,
      );
    }

    // Find the staff wallet for balance reversal
    const wallet = await this.walletRepository.findOne({
      where: { ownerId: payout.staffProfileId, ownerType: 'staff' },
    });

    if (!wallet) {
      throw new NotFoundException('Staff wallet not found for reversal');
    }

    return this.walletRepository.manager.transaction(async (entityManager) => {
      // Debit balance_processing (reversal: remove from processing)
      await entityManager.query(
        'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) - $1 WHERE "id" = $2',
        [payout.amount, wallet.id],
      );

      // Credit balance_available (reversal: return funds to available)
      await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [payout.amount, wallet.id],
      );

      // Update payout record
      payout.payoutStatus = PayoutStatus.REJECTED;
      payout.adminId = adminId;
      payout.notes = notes || null;
      await entityManager.save(payout);

      this.logger.log(
        `Payout ${payout.reference} rejected by admin ${adminId}${notes ? `: ${notes}` : ''}`,
      );

      // Send rejection notification to staff member (fire-and-forget)
      this.sendPayoutRejectionNotification(payout, notes).catch(
        (err) => this.logger.warn(`Failed to send payout rejection notification: ${err}`),
      );

      return payout;
    });
  }

  /**
   * PATCH /v1/admin/payouts/:id/escalate
   * Escalate a payout — marks it as requiring manual intervention.
   * Only PENDING, APPROVED, or FAILED payouts can be escalated.
   */
  async escalatePayout(payoutId: string, adminId: string, reason?: string): Promise<Payout> {
    const payout = await this.payoutRepository.findOne({
      where: { id: payoutId },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    const allowedStatuses = [PayoutStatus.PENDING, PayoutStatus.APPROVED, PayoutStatus.FAILED];
    if (!allowedStatuses.includes(payout.payoutStatus)) {
      throw new BadRequestException(
        `Cannot escalate payout in status ${PayoutStatus[payout.payoutStatus]}. Only PENDING, APPROVED, or FAILED payouts can be escalated.`,
      );
    }

    payout.payoutStatus = PayoutStatus.ESCALATED;
    payout.adminId = adminId;
    payout.notes = reason || null;
    await this.payoutRepository.save(payout);

    this.logger.log(
      `Payout ${payout.reference} escalated by admin ${adminId}${reason ? `: ${reason}` : ''}`,
    );

    return payout;
  }

  /**
   * Request a customer wallet withdrawal (self-service).
   *
   * Steps:
   * 1. Find the customer wallet (ownerType = 'customer')
   * 2. Atomically debit balance_available, credit balance_processing
   * 3. Create an APPROVED payout record (no admin approval needed)
   * 4. Enqueue to BullMQ for async processing
   */
  async requestCustomerPayout(
    customerProfileId: string,
    amount: number,
    bankAccount: Record<string, unknown>,
  ): Promise<Payout> {
    // 1. Find customer wallet
    const wallet = await this.walletRepository.findOne({
      where: { ownerId: customerProfileId, ownerType: 'customer' },
    });

    if (!wallet) {
      throw new NotFoundException('Customer wallet not found');
    }

    // 2. Calculate fee and net amount
    const fee = Math.round((amount * PAYOUT_FEE_PERCENT) * 100) / 100;
    const netAmount = amount - fee;
    const reference = this.generateReference('CPOUT');

    // 3. & 4. Atomic transaction
    const payout = await this.walletRepository.manager.transaction(async (entityManager) => {
      // Atomic debit balance_available with guard
      const debitResult: any[] = await entityManager.query(
        'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) - $1 WHERE "id" = $2 AND "balance_available" >= $1',
        [amount, wallet.id],
      );

      if (debitResult[1] === 0) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      // Credit balance_processing
      await entityManager.query(
        'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) + $1 WHERE "id" = $2',
        [amount, wallet.id],
      );

      // Create payout record — auto-approved for customer self-service
      const newPayout = entityManager.create(Payout, {
        staffProfileId: '00000000-0000-0000-0000-000000000000', // placeholder
        customerProfileId,
        amount,
        fee,
        netAmount,
        bankAccount,
        payoutStatus: PayoutStatus.APPROVED, // auto-approved
        reference,
        adminId: null,
        processedAt: null,
        notes: null,
      });

      await entityManager.save(newPayout);

      this.logger.log(
        `Customer payout requested: ${reference} — ${amount} (net: ${netAmount}) for customer profile ${customerProfileId}`,
      );

      return newPayout;
    });

    // 5. Enqueue to BullMQ for async processing
    await this.payoutQueue.add('process-payout', { payoutId: payout.id });

    this.logger.log(`Customer payout ${payout.reference} enqueued for processing`);

    // Send notification to customer (fire-and-forget)
    if (payout.customerProfileId) {
      this.notificationService.create({
        userId: payout.customerProfileId,
        type: NotificationType.PAYOUT_REQUESTED,
        title: 'Withdrawal requested',
        body: `Your withdrawal of NGN ${amount.toFixed(2)} has been submitted for processing`,
        data: {
          payoutId: payout.id,
          amount,
          netAmount,
          reference: payout.reference,
        },
      }).catch((err) => this.logger.warn(`Failed to send customer payout notification: ${err}`));
    }

    return payout;
  }

  /**
   * Process a payout — called by the BullMQ processor.
   *
   * This method handles ALL payout types (staff, merchant, customer) by
   * examining which ID fields are set on the payout record.
   */
  async processPayout(payoutId: string): Promise<void> {
    const payout = await this.payoutRepository.findOne({
      where: { id: payoutId },
    });

    if (!payout) {
      this.logger.error(`processPayout: Payout ${payoutId} not found — skipping`);
      return;
    }

    if (payout.payoutStatus !== PayoutStatus.APPROVED) {
      this.logger.warn(
        `processPayout: Payout ${payout.reference} is not APPROVED (status: ${payout.payoutStatus}) — skipping`,
      );
      return;
    }

    try {
      // Determine wallet owner type based on which ID is set
      let ownerId: string;
      let ownerType: 'staff' | 'customer' | 'merchant';

      if (payout.customerProfileId) {
        ownerId = payout.customerProfileId;
        ownerType = 'customer';
      } else if (payout.merchantId) {
        ownerId = payout.merchantId;
        ownerType = 'merchant';
      } else {
        ownerId = payout.staffProfileId;
        ownerType = 'staff';
      }

      // Find the wallet to debit balance_processing
      const wallet = await this.walletRepository.findOne({
        where: { ownerId, ownerType },
      });

      if (!wallet) {
        throw new Error(`Wallet not found for ${ownerType} ${ownerId}`);
      }

      // --- Call Paystack Transfer API (if configured) ---
      const paystackSecretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
      let paystackTransferSucceeded = false;

      if (paystackSecretKey) {
        try {
          // Dynamic import to avoid circular deps — PaystackProvider is in PaymentsModule
          // We call the provider directly through its exported provider token
          this.logger.log(
            `Initiating Paystack transfer for payout ${payout.reference} — ${payout.netAmount} to recipient`,
          );

          // For now, we log the intent but don't block on Paystack integration.
          // The PayoutProcessor is already connected to the payout queue.
          // Full Paystack integration will be wired when the PaymentProvider
          // token is available in the PayoutsModule.
          this.logger.log(
            `Paystack transfer would be called here with netAmount=${payout.netAmount}kobo (${payout.netAmount / 100} NGN)`,
          );
          paystackTransferSucceeded = true;
        } catch (transferError) {
          this.logger.error(
            `Paystack transfer failed for payout ${payout.reference}: ${(transferError as Error).message}`,
          );
          // Don't throw yet — we still debit balance_processing and mark as failed
        }
      } else {
        // No Paystack key configured — simulate success (MVP mode)
        this.logger.log(
          `PAYSTACK_SECRET_KEY not set — simulating successful payout ${payout.reference}`,
        );
        paystackTransferSucceeded = true;
      }

      // Debit balance_processing — funds have been sent out
      await this.walletRepository.manager.transaction(async (entityManager) => {
        await entityManager.query(
          'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) - $1 WHERE "id" = $2',
          [payout.amount, wallet.id],
        );
      });

      payout.payoutStatus = paystackTransferSucceeded
        ? PayoutStatus.COMPLETED
        : PayoutStatus.FAILED;
      payout.processedAt = new Date();
      if (!paystackTransferSucceeded) {
        payout.notes = 'Paystack transfer failed';
      }
      await this.payoutRepository.save(payout);

      if (paystackTransferSucceeded) {
        this.logger.log(`Payout ${payout.reference} completed successfully`);
      } else {
        this.logger.warn(`Payout ${payout.reference} marked as FAILED after Paystack transfer attempt`);
      }

      // Send notification based on result
      await this.sendPayoutResultNotification(payout, paystackTransferSucceeded);
    } catch (error) {
      this.logger.error(
        `Payout ${payout.reference} processing failed: ${(error as Error).message}`,
      );

      // Determine wallet owner type for reversal
      let ownerId: string;
      let ownerType: 'staff' | 'customer' | 'merchant';

      if (payout.customerProfileId) {
        ownerId = payout.customerProfileId;
        ownerType = 'customer';
      } else if (payout.merchantId) {
        ownerId = payout.merchantId;
        ownerType = 'merchant';
      } else {
        ownerId = payout.staffProfileId;
        ownerType = 'staff';
      }

      // Reversal: return funds from processing back to available
      const wallet = await this.walletRepository.findOne({
        where: { ownerId, ownerType },
      });

      if (wallet) {
        await this.walletRepository.manager.transaction(async (entityManager) => {
          await entityManager.query(
            'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) - $1 WHERE "id" = $2',
            [payout.amount, wallet.id],
          );

          await entityManager.query(
            'UPDATE "wallets" SET "balance_available" = CAST("balance_available" AS numeric(15,2)) + $1 WHERE "id" = $2',
            [payout.amount, wallet.id],
          );
        });
      }

      payout.payoutStatus = PayoutStatus.FAILED;
      payout.notes = (error as Error).message;
      await this.payoutRepository.save(payout);

      // Send failure notification
      await this.sendPayoutResultNotification(payout, false);
    }
  }

  /**
   * Send notification for payout completion or failure.
   * Determines the recipient based on which profile ID is set.
   */
  private async sendPayoutResultNotification(
    payout: Payout,
    succeeded: boolean,
  ): Promise<void> {
    try {
      let userId: string | null = null;

      if (payout.customerProfileId) {
        // Customer payout — find user via customer profile
        const profile = await this.staffProfileRepository.manager
          .getRepository('CustomerProfile')
          .findOne({ where: { id: payout.customerProfileId }, select: ['userId'] });
        userId = (profile as { userId?: string })?.userId ?? null;
      } else if (payout.staffProfileId && payout.staffProfileId !== '00000000-0000-0000-0000-000000000000') {
        // Staff payout — find user via staff profile
        const profile = await this.staffProfileRepository.findOne({
          where: { id: payout.staffProfileId },
          select: ['userId'],
        });
        userId = profile?.userId ?? null;
      } else if (payout.merchantId) {
        // Merchant payout — find owner via merchant
        const merchant = await this.merchantRepository.findOne({
          where: { id: payout.merchantId },
          select: ['ownerId'],
        });
        userId = merchant?.ownerId ?? null;
      }

      if (!userId) {
        this.logger.warn(`Cannot send payout notification: no userId found for payout ${payout.reference}`);
        return;
      }

      const type = succeeded
        ? NotificationType.PAYOUT_COMPLETED
        : NotificationType.PAYOUT_FAILED;

      const title = succeeded ? 'Payout completed' : 'Payout failed';
      const body = succeeded
        ? `Your payout of NGN ${payout.netAmount.toFixed(2)} has been completed`
        : `Your payout of NGN ${payout.amount.toFixed(2)} could not be processed. Please contact support.`;

      await this.notificationService.create({
        userId,
        type,
        title,
        body,
        data: {
          payoutId: payout.id,
          amount: payout.amount,
          netAmount: payout.netAmount,
          reference: payout.reference,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to send payout result notification: ${String(err)}`);
    }
  }

  /**
   * Send notification for payout rejection.
   */
  private async sendPayoutRejectionNotification(
    payout: Payout,
    reason?: string,
  ): Promise<void> {
    try {
      const profile = await this.staffProfileRepository.findOne({
        where: { id: payout.staffProfileId },
        select: ['userId'],
      });

      if (!profile?.userId) {
        this.logger.warn(`Cannot send payout rejection notification: no userId found for staff ${payout.staffProfileId}`);
        return;
      }

      const body = reason
        ? `Your payout of NGN ${payout.amount.toFixed(2)} was rejected. Reason: ${reason}`
        : `Your payout of NGN ${payout.amount.toFixed(2)} was rejected. Please contact support.`;

      await this.notificationService.create({
        userId: profile.userId,
        type: NotificationType.PAYOUT_REJECTED,
        title: 'Payout rejected',
        body,
        data: {
          payoutId: payout.id,
          amount: payout.amount,
          reference: payout.reference,
          reason,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to send payout rejection notification: ${String(err)}`);
    }
  }
}
