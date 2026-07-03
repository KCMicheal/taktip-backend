import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Payout } from './entities/payout.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { PayoutService } from './payouts.service';
import { PayoutProcessor } from './payouts.processor';
import { StaffPayoutController } from './staff-payout.controller';
import { AdminPayoutController } from './admin-payout.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payout, Wallet, StaffProfile, Merchant]),
    BullModule.registerQueue({ name: 'payouts' }),
    NotificationModule,
  ],
  controllers: [StaffPayoutController, AdminPayoutController],
  providers: [PayoutService, PayoutProcessor],
  exports: [PayoutService, TypeOrmModule],
})
export class PayoutsModule {}
