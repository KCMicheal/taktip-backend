import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { parse } from 'pg-connection-string';
import { HealthModule } from './health/health.module';

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
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
