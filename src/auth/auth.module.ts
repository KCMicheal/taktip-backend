import { Module, Global, CanActivate } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from './services/jwt.service';
import { OtpService } from './services/otp.service';
import { MailService } from './services/mail.service';
import { EmailFallbackService } from './services/email-fallback.service';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { AuthController } from './controllers/auth.controller';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { jwtAuthGuard } from './guards/jwt-auth.guard';
import { rolesGuard } from './guards/roles.guard';

/**
 * Auth Module - Provides JWT authentication and authorization functionality
 *
 * Features:
 * - JWT token generation and verification using Ed25519 keys
 * - Public endpoint marking via @Public() decorator
 * - Role-based access control via @Roles() decorator
 * - Current user extraction via @CurrentUser() decorator
 * - Merchant registration with email OTP verification
 * - Login with refresh token support
 * - Password reset functionality (forgot, reset, change password)
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, PasswordReset]),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    // JWT Services - single instance for both custom JwtService and NestJwtService alias
    JwtService,
    {
      provide: NestJwtService,
      useExisting: JwtService,
    },
    // Auth Services
    OtpService,
    MailService,
    EmailFallbackService,
    TokenService,
    AuthService,
    // Guards
    {
      provide: 'JWT_AUTH_GUARD',
      useFactory: (jwtService: JwtService, reflector: Reflector): CanActivate => {
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
  exports: [
    JwtService,
    NestJwtService,
    OtpService,
    MailService,
    TokenService,
    AuthService,
    TypeOrmModule,
  ],
})
export class AuthModule {}
