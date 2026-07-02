import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis-backed cache for pending 2FA setup data.
 *
 * Stores the TOTP secret and hashed backup codes temporarily while the user
 * scans the QR code and verifies. Only persisted to the DB after successful
 * TOTP verification via POST /2fa/enable.
 *
 * Keys expire after SETUP_TTL_SECONDS (default 10 minutes). If the user
 * abandons the setup, the secret evaporates automatically — no orphaned
 * secrets in the DB.
 */
@Injectable()
export class TwoFactorSetupCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(TwoFactorSetupCacheService.name);
  private readonly redis: Redis;
  private readonly PREFIX = '2fa:setup:';
  private readonly TTL_SECONDS: number;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.TTL_SECONDS = this.configService.get<number>('TWO_FA_SETUP_TTL_SECONDS', 600); // 10 min default
    this.redis = new Redis(redisUrl);

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error (2FA cache): ${err.message}`);
    });
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  /**
   * Store pending 2FA setup data in Redis.
   *
   * @param userId - The user ID (used as the cache key)
   * @param data - The TOTP secret and hashed backup codes to cache
   */
  async set(
    userId: string,
    data: { secret: string; hashedBackupCodes: string[] },
  ): Promise<void> {
    const key = this.PREFIX + userId;
    const value = JSON.stringify(data);

    await this.redis.setex(key, this.TTL_SECONDS, value);
    this.logger.log(
      `2FA setup cached for user ${userId} (TTL: ${this.TTL_SECONDS}s)`,
    );
  }

  /**
   * Retrieve pending 2FA setup data from Redis.
   *
   * @param userId - The user ID
   * @returns The cached setup data, or null if expired / not found
   */
  async get(
    userId: string,
  ): Promise<{ secret: string; hashedBackupCodes: string[] } | null> {
    const key = this.PREFIX + userId;
    const raw = await this.redis.get(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as { secret: string; hashedBackupCodes: string[] };
    } catch {
      this.logger.warn(`Failed to parse cached 2FA setup data for user ${userId}`);
      return null;
    }
  }

  /**
   * Delete pending 2FA setup data from Redis.
   * Called after successful enable, or on explicit cleanup.
   *
   * @param userId - The user ID
   */
  async del(userId: string): Promise<void> {
    const key = this.PREFIX + userId;
    await this.redis.del(key);
    this.logger.log(`2FA setup cache cleared for user ${userId}`);
  }
}
