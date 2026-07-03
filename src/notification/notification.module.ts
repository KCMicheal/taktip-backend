import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Notification } from './entities/notification.entity';
import { User } from '../auth/entities/user.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationCleanupService } from './notification.cleanup.service';
import { PaginationService } from '../common/pagination';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, CustomerProfile, StaffProfile]),
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
    NotificationCleanupService,
    PaginationService,
  ],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}
