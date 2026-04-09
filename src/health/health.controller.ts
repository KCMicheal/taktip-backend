import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import {
  HealthResponse,
  LivenessResponse,
  ReadinessResponse,
  NotReadyResponse,
} from './dto';

@ApiTags('health')
@Controller('health')
@ApiProduces('application/json')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    type: HealthResponse,
  })
  @ApiResponse({
    status: 503,
    description: 'Service is unhealthy',
    type: HealthResponse,
  })
  async check() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: await this.checkDatabase(),
        redis: await this.checkRedis(),
      },
    };

    const allHealthy = Object.values(health.services).every(
      (s) => s.status === 'up',
    );

    health.status = allHealthy ? 'ok' : 'degraded';

    return health;
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
    type: LivenessResponse,
  })
  liveness() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({
    status: 200,
    description: 'Service is ready',
    type: ReadinessResponse,
  })
  @ApiResponse({
    status: 503,
    description: 'Service is not ready',
    type: NotReadyResponse,
  })
  async readiness() {
    const dbHealthy = (await this.checkDatabase()).status === 'up';

    if (!dbHealthy) {
      return { status: 'not_ready', reason: 'Database not connected' };
    }

    return { status: 'ready', timestamp: new Date().toISOString() };
  }

  private async checkDatabase() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch {
      return { status: 'down', error: 'Database connection failed' };
    }
  }

  private async checkRedis() {
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
