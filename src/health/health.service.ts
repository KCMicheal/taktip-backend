import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  async checkDatabase(): Promise<{ status: string; error?: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch {
      return { status: 'down', error: 'Database connection failed' };
    }
  }

  async checkRedis(): Promise<{ status: string; error?: string }> {
    try {
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      await redis.ping();
      await redis.quit();
      return { status: 'up' };
    } catch {
      return { status: 'down', error: 'Redis connection failed' };
    }
  }
}
