import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerProfile } from './entities/customer-profile.entity';
import { User } from '../auth/entities/user.entity';
import { Tip } from '../tips/entities/tip.entity';
import { Transaction } from '../wallet/entities/transaction.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { CustomerService } from './customer.service';
import { CustomerActivityService } from './services/customer-activity.service';
import { CustomerController } from './customer.controller';
import { PaginationService } from '../common/pagination';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerProfile,
      User,
      Tip,
      Transaction,
      Wallet,
      StaffProfile,
      Merchant,
    ]),
  ],
  controllers: [CustomerController],
  providers: [CustomerService, CustomerActivityService, PaginationService],
  exports: [CustomerService, TypeOrmModule],
})
export class CustomerModule {}
