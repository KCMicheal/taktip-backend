import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PUBLIC_KEY } from '../decorators/public.decorator';

export const jwtAuthGuard = (jwtService: JwtService, reflector: Reflector) => {
  @Injectable()
  class JwtAuthGuardImpl implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const [type, token] = request.headers.authorization?.split(' ') ?? [];

      if (!token || type !== 'Bearer') {
        throw new UnauthorizedException('Invalid authentication token');
      }

      try {
        const payload = await jwtService.verifyAsync(token);
        request['user'] = payload;
      } catch {
        throw new UnauthorizedException('Invalid or expired token');
      }

      return true;
    }

    handleRequest(err: any, user: any) {
      if (err || !user) {
        throw err || new UnauthorizedException();
      }
      return user;
    }
  }

  return new JwtAuthGuardImpl();
};
