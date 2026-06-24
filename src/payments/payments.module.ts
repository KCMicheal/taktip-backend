import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentEvent } from './entities/payment-event.entity';
import { PaymentsController } from './payments.controller';
import { QrCodesModule } from '../qrcodes/qrcodes.module';
import { TipsModule } from '../tips/tips.module';
import { WalletModule } from '../wallet/wallet.module';
import { PAYMENT_PROVIDER } from './providers/providers.constants';
import { PaystackProvider } from './providers/paystack/paystack.provider';
import { PaymentEventService } from './payment-event.service';
import { Tip } from '../tips/entities/tip.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { StaffProfile } from '../staff/entities/staff-profile.entity';
import { CustomerProfile } from '../customer/entities/customer-profile.entity';
import { User } from '../auth/entities/user.entity';
import { MailService } from '../auth/services/mail.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, PaymentEvent, Tip, Wallet, StaffProfile, CustomerProfile, User]),
    ConfigModule,
    QrCodesModule,
    TipsModule,
    WalletModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentEventService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        configService: ConfigService,
        paymentRepo: Repository<Payment>,
        tipRepo: Repository<Tip>,
        walletRepo: Repository<Wallet>,
        customerProfileRepo: Repository<CustomerProfile>,
        userRepo: Repository<User>,
        paymentEventService: PaymentEventService,
        mailService: MailService,
      ) => {
        const providerName = configService.get<string>('PAYMENT_PROVIDER', 'paystack');
        switch (providerName) {
          case 'paystack':
            return new PaystackProvider(
              paymentRepo,
              tipRepo,
              walletRepo,
              customerProfileRepo,
              userRepo,
              configService,
              paymentEventService,
              mailService,
            );
          // Future providers:
          // case 'stripe':
          //   return new StripeProvider(...);
          default:
            throw new Error(`Unknown payment provider: ${providerName}`);
        }
      },
      inject: [
        ConfigService,
        getRepositoryToken(Payment),
        getRepositoryToken(Tip),
        getRepositoryToken(Wallet),
        getRepositoryToken(CustomerProfile),
        getRepositoryToken(User),
        PaymentEventService,
        MailService,
      ],
    },
  ],
  exports: [PAYMENT_PROVIDER, PaymentEventService, TypeOrmModule],
})
export class PaymentsModule {}
