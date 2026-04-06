import { Module, Global, CanActivate } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { JwtService } from './services/jwt.service';
import { jwtAuthGuard } from './guards/jwt-auth.guard';
import { rolesGuard } from './guards/roles.guard';
import { Reflector } from '@nestjs/core';

/**
 * Auth Module - Provides JWT authentication and authorization functionality
 * 
 * Features:
 * - JWT token generation and verification using Ed25519 keys
 * - Public endpoint marking via @Public() decorator
 * - Role-based access control via @Roles() decorator
 * - Current user extraction via @CurrentUser() decorator
 */
@Global()
@Module({
  providers: [
    // Provide our custom Ed25519 JwtService as the JwtService from @nestjs/jwt
    // This allows the JwtAuthGuard to work with our Ed25519 implementation
    {
      provide: NestJwtService,
      useFactory: (): NestJwtService => {
        // Create instance of our custom JwtService
        const service = new JwtService();
        // Initialize keys synchronously would be ideal, but we need async
        // The onModuleInit will be called by NestJS after construction
        return service as unknown as NestJwtService;
      },
    },
    JwtService,
    {
      provide: 'JWT_AUTH_GUARD',
      useFactory: (jwtService: JwtService, reflector: Reflector): CanActivate => {
        // Type assertion to handle the interface mismatch between our custom JwtService
        // and @nestjs/jwt's JwtService. Both have verifyAsync method.
        return jwtAuthGuard(jwtService as unknown as NestJwtService, reflector) as CanActivate;
      },
      inject: [JwtService, Reflector],
    },
    {
      provide: 'ROLES_GUARD',
      useFactory: (reflector: Reflector): CanActivate => {
        return rolesGuard(reflector) as CanActivate;
      },
      inject: [Reflector],
    },
  ],
  exports: [JwtService, NestJwtService],
})
export class AuthModule {}
