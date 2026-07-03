import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { parse } from 'pg-connection-string';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StaffModule } from './staff/staff.module';
import { MerchantModule } from './merchant/merchant.module';
import { WalletModule } from './wallet/wallet.module';
import { CustomerModule } from './customer/customer.module';
import { QueueModule } from './queue/queue.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PaymentsModule } from './payments/payments.module';
import { QrCodesModule } from './qrcodes/qrcodes.module';
import { TipsModule } from './tips/tips.module';
import { CustomerTipsModule } from './customer-tips/customer-tips.module';
import { ShiftsModule } from './shifts/shifts.module';
import { BankModule } from './bank/bank.module';
import { AdminModule } from './admin/admin.module';
import { NotificationModule } from './notification/notification.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        
        let config: Record<string, unknown> = {
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'taktip',
          password: 'devpassword',
          database: 'taktip_dev',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
          logging: configService.get<string>('NODE_ENV') !== 'production',
        };

        // Override with DATABASE_URL if provided
        if (databaseUrl) {
          const parsed = parse(databaseUrl);
          config = {
            ...config,
            host: parsed.host || 'localhost',
            port: parsed.port ? parseInt(parsed.port, 10) : 5432,
            username: parsed.user || 'taktip',
            password: parsed.password || 'devpassword',
            database: parsed.database || 'taktip_dev',
          };
        }

        return config;
      },
    }),
    // Rate limiting configuration
    // Default: 120 requests per minute for all routes
    // Use @Throttle() on specific routes to override (e.g., /login: 5 per 15 min)
    ThrottlerModule.forRoot({
      throttlers: [
        {
          limit: 120,
          ttl: 60000, // 1 minute in milliseconds
        },
      ],
    }),
    QrCodesModule,
    BankModule,
    MerchantModule,
    WalletModule,
    AuthModule,
    HealthModule,
    StaffModule,
    CustomerModule,
    QueueModule,
    PayoutsModule,
    PaymentsModule,
    TipsModule,
    CustomerTipsModule,
    ShiftsModule,
    AdminModule,
    NotificationModule,
  ],
  controllers: [],
  providers: [
    // Apply ThrottlerGuard globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Apply response interceptor globally
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // Apply exception filter globally
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
