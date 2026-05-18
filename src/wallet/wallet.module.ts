import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletController } from './wallet.controller';
import { MerchantWalletController } from './merchant-wallet.controller';
import { StaffWalletController } from './staff-wallet.controller';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction, StaffProfile])],
  controllers: [WalletController, MerchantWalletController, StaffWalletController],
  providers: [WalletService],
  exports: [WalletService, TypeOrmModule],
})
export class WalletModule {}
