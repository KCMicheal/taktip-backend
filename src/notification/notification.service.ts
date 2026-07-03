import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/enums/role.enum';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { NotificationGateway } from './notification.gateway';
import { PaginationService, PaginatedResult } from '../common/pagination';

// Types that have preferences mapped to in-app notifications
const TIP_PREF_TYPES = [
  NotificationType.TIP_RECEIVED,
  NotificationType.TIP_SENT,
];

const PAYOUT_PREF_TYPES = [
  NotificationType.PAYOUT_COMPLETED,
  NotificationType.PAYOUT_FAILED,
  NotificationType.PAYOUT_REJECTED,
];

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CustomerProfile)
    private readonly customerProfileRepository: Repository<CustomerProfile>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepository: Repository<StaffProfile>,
    private readonly configService: ConfigService,
    private readonly gateway: NotificationGateway,
    private readonly paginationService: PaginationService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────

  /**
   * Create a single notification.
   * Checks user preferences before creating.
   * Emits real-time event via WebSocket after creation.
   */
  async create(dto: CreateNotificationDto): Promise<Notification | null> {
    // Check if user has disabled this notification type
    const shouldNotify = await this.shouldNotify(dto.userId, dto.type);
    if (!shouldNotify) {
      this.logger.debug(
        `Notification skipped: user ${dto.userId} has disabled ${dto.type}`,
      );
      return null;
    }

    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data || {},
    });

    const saved = await this.notificationRepository.save(notification);

    this.logger.log(
      `Notification created: ${dto.type} for user ${dto.userId}`,
    );

    // Emit real-time event
    await this.sendRealtime(dto.userId, saved);

    return saved;
  }

  /**
   * Create multiple notifications in a single query (for broadcasts).
   */
  async createBulk(dtos: CreateNotificationDto[]): Promise<Notification[]> {
    if (dtos.length === 0) return [];

    const notifications = dtos.map((dto) =>
      this.notificationRepository.create({
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: dto.data || {},
      }),
    );

    const saved = await this.notificationRepository.save(notifications);

    this.logger.log(`Bulk notifications created: ${saved.length} notifications`);

    // Emit real-time events
    for (const notification of saved) {
      await this.sendRealtime(notification.userId, notification);
    }

    return saved;
  }

  // ── Read ────────────────────────────────────────────────────────────────

  /**
   * Find notifications for a user with pagination and filtering.
   */
  async findByUser(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<Notification>> {
    const qb: SelectQueryBuilder<Notification> =
      this.notificationRepository
        .createQueryBuilder('n')
        .where('n.user_id = :userId', { userId })
        .orderBy('n.created_at', 'DESC');

    // Filter by type
    if (query.type) {
      qb.andWhere('n.type = :type', { type: query.type });
    }

    // Filter by read status
    if (query.status === 'read') {
      qb.andWhere('n.read_at IS NOT NULL');
    } else if (query.status === 'unread') {
      qb.andWhere('n.read_at IS NULL');
    }

    // Execute query with pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = this.paginationService.getSkip(page, limit);
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return this.paginationService.wrap(items, total, page, limit);
  }

  /**
   * Get unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, readAt: null as unknown as undefined },
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────

  /**
   * Mark a single notification as read.
   * Ownership check: user can only mark their own notifications.
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this notification');
    }

    if (notification.readAt) {
      return notification; // already read
    }

    notification.readAt = new Date();
    const updated = await this.notificationRepository.save(notification);

    // Send updated unread count
    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.sendUnreadCount(userId, unreadCount);

    return updated;
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: () => 'NOW()' })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();

    // Send updated unread count (0)
    this.gateway.sendUnreadCount(userId, 0);
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  /**
   * Delete a notification. Ownership check enforced.
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this notification');
    }

    await this.notificationRepository.remove(notification);

    // Send updated unread count
    const unreadCount = await this.getUnreadCount(userId);
    this.gateway.sendUnreadCount(userId, unreadCount);
  }

  // ── Broadcast (Admin) ───────────────────────────────────────────────────

  /**
   * Broadcast a system or marketing notification.
   * If targetUserIds is provided, sends only to those users.
   * Otherwise, sends to ALL users.
   */
  async broadcast(
    dto: BroadcastNotificationDto,
    adminId: string,
  ): Promise<{ count: number }> {
    let userIds: string[];

    if (dto.targetUserIds && dto.targetUserIds.length > 0) {
      userIds = dto.targetUserIds;
    } else {
      // Broadcast to ALL users
      const allUsers = await this.userRepository.find({
        select: ['id'],
      });
      userIds = allUsers.map((u) => u.id);
    }

    const dtos: CreateNotificationDto[] = userIds.map((userId) => ({
      userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data,
    }));

    const notifications = await this.createBulk(dtos);

    this.logger.log(
      `Broadcast ${dto.type} by admin ${adminId}: sent to ${notifications.length} users`,
    );

    return { count: notifications.length };
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /**
   * Delete notifications older than the specified number of days.
   * Used by the cron job and admin manual cleanup.
   */
  async cleanupOldNotifications(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff: cutoffDate })
      .execute();

    const deletedCount = result.affected || 0;

    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} notifications older than ${olderThanDays} days`,
      );
    }

    return deletedCount;
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Check if a user should receive a notification based on their preferences.
   */
  private async shouldNotify(
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    // System, marketing, and welcome notifications are always sent
    if (
      type === NotificationType.SYSTEM ||
      type === NotificationType.MARKETING ||
      type === NotificationType.WELCOME
    ) {
      return true;
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'role'],
    });

    if (!user) return false;

    switch (user.role) {
      case Role.CUSTOMER:
        return this.checkCustomerPreferences(userId, type);

      case Role.STAFF:
        return this.checkStaffPreferences(userId, type);

      case Role.MERCHANT:
      case Role.ADMIN:
      default:
        // No preferences set yet → always notify
        return true;
    }
  }

  /**
   * Check customer notification preferences.
   */
  private async checkCustomerPreferences(
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const profile = await this.customerProfileRepository.findOne({
      where: { userId },
      select: ['notificationPreferences'],
    });

    if (!profile?.notificationPreferences) return true;

    const prefs = profile.notificationPreferences;

    // tipReceived controls both tip_received and tip_sent
    if (TIP_PREF_TYPES.includes(type)) {
      if (prefs.tipReceived === false) return false;
    }

    // tipWithdrawn controls payout-related notifications
    if (PAYOUT_PREF_TYPES.includes(type)) {
      if (prefs.tipWithdrawn === false) return false;
    }

    return true;
  }

  /**
   * Check staff notification preferences.
   */
  private async checkStaffPreferences(
    userId: string,
    _type: NotificationType,
  ): Promise<boolean> {
    const profile = await this.staffProfileRepository.findOne({
      where: { userId },
      select: ['settings'],
    });

    if (!profile?.settings) return true;

    const settings = profile.settings;
    const notifications = settings.notifications as Record<string, unknown> | undefined;

    if (!notifications) return true;

    // Staff "push" preference controls in-app notifications
    if (notifications.push === false) return false;

    return true;
  }

  /**
   * Send a real-time notification via WebSocket.
   */
  private async sendRealtime(
    userId: string,
    notification: Notification,
  ): Promise<void> {
    try {
      this.gateway.sendToUser(userId, 'notification', notification);

      // Also send updated unread count
      const unreadCount = await this.getUnreadCount(userId);
      this.gateway.sendUnreadCount(userId, unreadCount);
    } catch (error) {
      // WebSocket errors should not block notification creation
      this.logger.warn(
        `Failed to send real-time notification to user ${userId}: ${String(error)}`,
      );
    }
  }
}
