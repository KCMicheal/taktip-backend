import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/enums/role.enum';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { Notification } from './entities/notification.entity';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'notifications', version: 'v1' })
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ── User Endpoints ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Get notifications for the authenticated user',
    description:
      'Returns a paginated list of notifications. Supports filtering by type and read status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of notifications',
  })
  async findAll(
    @CurrentUser() user: { sub: string },
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.findByUser(user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the number of unread notifications for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread notification count',
    schema: { type: 'object', properties: { count: { type: 'number' } } },
  })
  async getUnreadCount(@CurrentUser() user: { sub: string }) {
    const count = await this.notificationService.getUnreadCount(user.sub);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark a notification as read',
    description: 'Marks a single notification as read. Users can only mark their own notifications.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ): Promise<Notification> {
    return this.notificationService.markAsRead(id, user.sub);
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all unread notifications as read for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentUser() user: { sub: string }) {
    await this.notificationService.markAllAsRead(user.sub);
    return { message: 'All notifications marked as read' };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a notification',
    description: 'Deletes a single notification. Users can only delete their own notifications.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
  ) {
    await this.notificationService.delete(id, user.sub);
    return { message: 'Notification deleted' };
  }

  // ── Admin Endpoints ───────────────────────────────────────────────────

  @Post('broadcast')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Broadcast a system or marketing notification (Admin only)',
    description:
      'Sends a notification to specific users or all users. Only SYSTEM and MARKETING types are allowed.',
  })
  @ApiResponse({ status: 201, description: 'Broadcast sent successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async broadcast(
    @Body() dto: BroadcastNotificationDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.notificationService.broadcast(dto, user.sub);
  }

  @Delete('admin/cleanup')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Manually cleanup old notifications (Admin only)',
    description:
      'Deletes notifications older than the specified number of days. Defaults to 60 days.',
  })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async cleanup(
    @Query('olderThan') olderThan?: string,
  ) {
    const days = parseInt(olderThan || '60', 10);
    const deletedCount = await this.notificationService.cleanupOldNotifications(days);
    return {
      message: `Deleted ${deletedCount} notifications older than ${days} days`,
      deletedCount,
    };
  }
}
