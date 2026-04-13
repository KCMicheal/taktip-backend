import { ApiProperty } from '@nestjs/swagger';

class HealthServiceStatus {
  @ApiProperty({ example: 'up' })
  status: string;
}

class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: '2026-04-09T20:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 3600 })
  uptime: number;

  @ApiProperty({ type: [Object] })
  services: {
    database: HealthServiceStatus;
    redis: HealthServiceStatus;
  };
}

class LivenessResponse {
  @ApiProperty({ example: 'alive' })
  status: string;

  @ApiProperty({ example: '2026-04-09T20:00:00.000Z' })
  timestamp: string;
}

class ReadinessResponse {
  @ApiProperty({ example: 'ready' })
  status: string;

  @ApiProperty({ example: '2026-04-09T20:00:00.000Z' })
  timestamp: string;
}

class NotReadyResponse {
  @ApiProperty({ example: 'not_ready' })
  status: string;

  @ApiProperty({ example: 'Database not connected' })
  reason: string;
}

export {
  HealthResponse,
  LivenessResponse,
  ReadinessResponse,
  NotReadyResponse,
};
