import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PayoutService } from './payouts.service';

@Processor('payouts')
export class PayoutProcessor {
  private readonly logger = new Logger(PayoutProcessor.name);

  constructor(private readonly payoutService: PayoutService) {}

  @Process('process-payout')
  async handleProcessPayout(job: Job<{ payoutId: string }>): Promise<void> {
    const { payoutId } = job.data;
    this.logger.log(`Processing payout job ${job.id} — payoutId: ${payoutId}`);

    try {
      await this.payoutService.processPayout(payoutId);
      this.logger.log(`Payout job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Payout job ${job.id} failed: ${(error as Error).message}`,
      );
      // Re-throw so BullMQ can handle retries based on job options
      throw error;
    }
  }
}
