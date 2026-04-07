import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PUBLIC_KEY } from '../decorators/public.decorator';

interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: Record<string, unknown>;
}

/**
 * Factory function to create JwtAuthGuard instance
 * This allows the guard to be created with proper dependency injection
 */
export function jwtAuthGuard(jwtService: JwtService, reflector: Reflector): JwtAuthGuard {
  return new JwtAuthGuard(jwtService, reflector);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader: string | undefined = request.headers.authorization;
    const authParts: string[] = authHeader ? authHeader.split(' ') : [];
    const type: string = authParts[0] ?? '';
    const token: string = authParts[1] ?? '';

    if (!token || type !== 'Bearer') {
      throw new UnauthorizedException('Invalid authentication token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
      request.user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  handleRequest<TUser = Record<string, unknown>>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
