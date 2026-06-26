import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { MerchantModule } from '../merchant/merchant.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { AuditModule } from '../audit/audit.module';
import { SupportModule } from '../support/support.module';
import { HealthModule } from '../health/health.module';
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
    // Import for AuditService
    AuditModule,
    // Import for SupportService
    SupportModule,
    // Import for HealthService
    HealthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
