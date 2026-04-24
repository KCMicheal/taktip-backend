import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { parse } from 'pg-connection-string';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

@Module({
  imports: [
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
    // Login endpoints: 5 requests per 15 minutes
    // Global endpoints: 120 requests per minute
    ThrottlerModule.forRoot([
      {
        name: 'login',
        limit: 5,
        ttl: 900000, // 15 minutes in milliseconds
      },
      {
        name: 'global',
        limit: 120,
        ttl: 60000, // 1 minute in milliseconds
      },
    ]),
    AuthModule,
    HealthModule,
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
