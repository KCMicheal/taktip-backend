import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { MerchantModule } from '../merchant/merchant.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    // Register repositories directly (AuthModule is @Global so User is available,
    // but explicit registration ensures clarity and avoids ambiguity)
    TypeOrmModule.forFeature([User, Merchant, Payout]),
    // Import for MerchantService
    MerchantModule,
    // Import for PayoutService (future use)
    PayoutsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
