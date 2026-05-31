import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaystackService } from './paystack.service';
import { PaymentsController } from './payments.controller';
import { QrCodesModule } from '../qrcodes/qrcodes.module';
import { TipsModule } from '../tips/tips.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    QrCodesModule,
    TipsModule,
    WalletModule,
  ],
  controllers: [PaymentsController],
  providers: [PaystackService],
  exports: [PaystackService, TypeOrmModule],
})
export class PaymentsModule {}
