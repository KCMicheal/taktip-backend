import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerTipsService } from './customer-tips.service';
import { CustomerTipsController } from './customer-tips.controller';
import { Tip } from '../tips/entities/tip.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { User } from '../auth/entities/user.entity';
import { CustomerModule } from '../customer/customer.module';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tip, CustomerProfile, StaffProfile, Merchant, Payment, Wallet, User]),
    CustomerModule,
    WalletModule,
    PaymentsModule,
    NotificationModule,
  ],
  controllers: [CustomerTipsController],
  providers: [CustomerTipsService],
  exports: [CustomerTipsService],
})
export class CustomerTipsModule {}
