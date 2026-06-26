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
   * Process a payout — called by the BullMQ processor.
   *
   * In production, this would call the Paystack Transfer API to send funds
   * to the staff member's bank account.
   *
   * For MVP: simulate success by marking as COMPLETED.
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
      // --- PRODUCTION: Call Paystack Transfer API here ---
      // const paystackSecretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
      // const recipientCode = await this.createPaystackTransferRecipient(payout);
      // const transfer = await this.initiatePaystackTransfer(recipientCode, payout.netAmount, payout.reference);
      // if (transfer.status !== 'success') throw new Error('Paystack transfer failed');

      // --- MVP: Simulate successful processing ---
      const wallet = await this.walletRepository.findOne({
        where: { ownerId: payout.staffProfileId, ownerType: 'staff' },
      });

      if (!wallet) {
        throw new Error(`Staff wallet not found for profile ${payout.staffProfileId}`);
      }

      // Debit balance_processing — funds have been sent out
      await this.walletRepository.manager.transaction(async (entityManager) => {
        await entityManager.query(
          'UPDATE "wallets" SET "balance_processing" = CAST("balance_processing" AS numeric(15,2)) - $1 WHERE "id" = $2',
          [payout.amount, wallet.id],
        );
      });

      payout.payoutStatus = PayoutStatus.COMPLETED;
      payout.processedAt = new Date();
      await this.payoutRepository.save(payout);

      this.logger.log(`Payout ${payout.reference} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Payout ${payout.reference} processing failed: ${(error as Error).message}`,
      );

      // Reversal: return funds from processing back to available
      const wallet = await this.walletRepository.findOne({
        where: { ownerId: payout.staffProfileId, ownerType: 'staff' },
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
    }
  }
}
