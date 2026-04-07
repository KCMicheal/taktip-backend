import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@/auth/decorators/roles.decorator';
import { Role } from '@/auth/enums/role.enum';

interface AuthenticatedRequest {
  user?: {
    role?: Role;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Factory function to create RolesGuard instance
 * This allows the guard to be created with proper dependency injection
 */
export function rolesGuard(reflector: Reflector): RolesGuard {
  return new RolesGuard(reflector);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check roles from both handler-level and class-level decorators
    const handlerRoles = this.reflector.get<Role[] | undefined>(ROLES_KEY, context.getHandler());
    const classRoles = this.reflector.get<Role[] | undefined>(ROLES_KEY, context.getClass());
    
    // Combine roles: class-level + handler-level (handler takes precedence)
    const requiredRoles = [...(classRoles || []), ...(handlerRoles || [])];

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: No role specified');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException('Access denied: Insufficient permissions');
    }

    return true;
  }
}
