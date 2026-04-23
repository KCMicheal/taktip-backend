import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

// Response schemas - defined inline to ensure they're included
const responseSchemas: Record<string, SchemaObject> = {
  // Auth response schemas
  RegisterMerchantResponseDto: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'OTP sent to merchant@restaurant.com' },
      email: { type: 'string', example: 'merchant@restaurant.com' },
    },
  },
  VerifyOtpResponseDto: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Email verified successfully. You can now login.' },
      user: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
          email: { type: 'string', example: 'merchant@restaurant.com' },
          role: { type: 'string', enum: ['MERCHANT', 'STAFF', 'ADMIN'], example: 'MERCHANT' },
        },
      },
    },
  },
  ResendOtpResponseDto: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'New OTP sent to merchant@restaurant.com' },
    },
  },
  LoginResponseDto: {
    type: 'object',
    properties: {
      accessToken: { type: 'string', example: 'eyJhbGciOiJFZERTQSJ9...' },
      refreshToken: { type: 'string', example: 'eyJhbGciOiJFZERTQSJ9...' },
      expiresIn: { type: 'number', example: 900 },
    },
  },
  RefreshTokenResponseDto: {
    type: 'object',
    properties: {
      accessToken: { type: 'string', example: 'eyJhbGciOiJFZERTQSJ9...' },
      refreshToken: { type: 'string', example: 'eyJhbGciOiJFZERTQSJ9...' },
      expiresIn: { type: 'number', example: 900 },
    },
  },
  LogoutResponseDto: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Logged out successfully' },
    },
  },
  LogoutAllResponseDto: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Logged out from all devices' },
    },
  },
  ErrorResponseDto: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Error message' },
      error: { type: 'string', example: 'Bad Request' },
      statusCode: { type: 'number', example: 400 },
    },
  },
  // Health response schemas
  HealthResponseDto: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ok' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-04-09T20:00:00.000Z' },
      uptime: { type: 'number', example: 3600 },
      services: {
        type: 'object',
        properties: {
          database: { type: 'object', properties: { status: { type: 'string', example: 'up' } } },
          redis: { type: 'object', properties: { status: { type: 'string', example: 'up' } } },
        },
      },
    },
  },
  LivenessResponseDto: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'alive' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-04-09T20:00:00.000Z' },
    },
  },
  ReadinessResponseDto: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'ready' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-04-09T20:00:00.000Z' },
    },
  },
  NotReadyResponseDto: {
    type: 'object',
    properties: {
      status: { type: 'string', example: 'not_ready' },
      reason: { type: 'string', example: 'Database not connected' },
    },
  },
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ========== CORS Configuration ==========
  // Get allowed origins from environment variable
  // In development: http://localhost:5173 (Vite), http://localhost:3000 (React)
  // In staging/production: Set ALLOWED_ORIGINS env var with your deployed URLs
  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://localhost:3000';
  
  // Convert comma-separated string to array
  const originsArray = allowedOrigins.split(',').map(origin => origin.trim());
  
  // Enable CORS with configured origins
  app.enableCors({
    origin: originsArray,
    credentials: true, // Allow cookies/auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  console.log(`🌐 CORS enabled for origins: ${originsArray.join(', ')}`);

  // API versioning configuration
  const apiVersion = configService.get<string>('API_VERSION', 'v1') ?? 'v1';

  // Set global prefix to 'api' (version comes from API_VERSION env)
  app.setGlobalPrefix(`api/${apiVersion}`);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerUrls = [];

  // Create base document with all endpoints (from Auth & Health modules)
  const baseConfig = new DocumentBuilder()
    .setTitle('TakTip API')
    .setDescription('Digital tipping platform for service businesses')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const baseDocument = SwaggerModule.createDocument(app, baseConfig, {
    include: [AuthModule, HealthModule],
    deepScanRoutes: true,
  });

  // Manually add response schemas to the document
  const schemasWithResponses = {
    ...baseDocument.components?.schemas,
    ...responseSchemas,
  };

  // Helper function to create document with custom info
  const createVersionDocument = (doc: typeof baseDocument, version: string, isEmpty: boolean) => {
    return {
      ...doc,
      info: {
        title: `TakTip API - ${version.toUpperCase()}`,
        description: isEmpty
          ? `Digital tipping platform for service businesses (${version.toUpperCase()} - Coming Soon)`
          : `Digital tipping platform for service businesses (${version.toUpperCase()})`,
        version: version.replace('v', ''),
      },
      paths: isEmpty ? {} : doc.paths,
      components: {
        ...doc.components,
        schemas: schemasWithResponses,
      },
    };
  };

  // V1 Document - all current endpoints
  const v1Document = createVersionDocument(baseDocument, 'v1', false);

  SwaggerModule.setup('swagger/v1/docs', app, v1Document, {
    jsonDocumentUrl: '/swagger/v1/swagger-json',
    customSiteTitle: 'TakTip API - V1',
    useGlobalPrefix: false,
  });

  swaggerUrls.push({
    url: '/swagger/v1/swagger-json',
    name: 'V1 API',
  });

  // V2 Document - empty (no v2 endpoints yet)
  const v2Document = createVersionDocument(baseDocument, 'v2', true);

  SwaggerModule.setup('swagger/v2/docs', app, v2Document, {
    jsonDocumentUrl: '/swagger/v2/swagger-json',
    customSiteTitle: 'TakTip API - V2',
    useGlobalPrefix: false,
  });

  swaggerUrls.push({
    url: '/swagger/v2/swagger-json',
    name: 'V2 API (Coming Soon)',
  });

  // V3 Document - empty (no v3 endpoints yet)
  const v3Document = createVersionDocument(baseDocument, 'v3', true);

  SwaggerModule.setup('swagger/v3/docs', app, v3Document, {
    jsonDocumentUrl: '/swagger/v3/swagger-json',
    customSiteTitle: 'TakTip API - V3',
    useGlobalPrefix: false,
  });

  swaggerUrls.push({
    url: '/swagger/v3/swagger-json',
    name: 'V3 API (Coming Soon)',
  });

  // Main swagger with dropdown selector
  SwaggerModule.setup('swagger/docs', app, v1Document, {
    explorer: true,
    swaggerOptions: {
      urls: swaggerUrls,
    },
    customSiteTitle: 'TakTip API Documentation',
    useGlobalPrefix: false,
  });

  const port = Number(configService.get<string>('APP_PORT', '3001'));
  await app.listen(port);

  console.log(`🚀 TakTip Backend running on http://localhost:${port}`);
  console.log(`📚 API Docs with dropdown: http://localhost:${port}/swagger/docs`);
  console.log(`🔗 Auth routes: http://localhost:${port}/api/${apiVersion}/auth/*`);
  console.log(`🔗 Health routes: http://localhost:${port}/api/${apiVersion}/health/*`);
}

void bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
