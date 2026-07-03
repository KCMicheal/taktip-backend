import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationCleanupService {
  private readonly logger = new Logger(NotificationCleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Auto-cleanup old notifications daily at 2 AM.
   * Only runs in staging and production environments.
   * Development environment skips auto-cleanup.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCleanup(): Promise<void> {
    const env = this.configService.get<string>('NODE_ENV');

    // Skip auto-cleanup in development
    if (env === 'development') {
      this.logger.debug('Skipping notification cleanup in development mode');
      return;
    }

    const retentionDays = this.configService.get<number>(
      'NOTIFICATION_RETENTION_DAYS',
      60,
    );

    this.logger.log(
      `Running notification cleanup: removing notifications older than ${retentionDays} days`,
    );

    try {
      const deletedCount =
        await this.notificationService.cleanupOldNotifications(retentionDays);

      this.logger.log(
        `Notification cleanup completed: deleted ${deletedCount} notifications`,
      );
    } catch (error) {
      this.logger.error(`Notification cleanup failed: ${(error as Error).message}`);
    }
  }
}
