import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

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

  // Helper function to create document with custom info
  const createVersionDocument = (doc: OpenAPIObject, version: string, isEmpty: boolean): OpenAPIObject => {
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
  SwaggerModule.setup('swagger/docs', app, baseDocument, {
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