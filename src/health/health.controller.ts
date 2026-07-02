import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProduces } from '@nestjs/swagger';
import {
  HealthResponse,
  LivenessResponse,
  ReadinessResponse,
  NotReadyResponse,
} from './dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
@ApiProduces('application/json')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
        database: await this.healthService.checkDatabase(),
        redis: await this.healthService.checkRedis(),
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
  @HttpCode(HttpStatus.OK)
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
    const dbHealthy = (await this.healthService.checkDatabase()).status === 'up';

    if (!dbHealthy) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        reason: 'Database not connected',
      });
    }

    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}
