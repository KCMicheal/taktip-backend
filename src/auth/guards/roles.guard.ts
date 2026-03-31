import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

export const rolesGuard = (reflector: Reflector) => {
  @Injectable()
  class RolesGuardImpl implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const requiredRoles = reflector.get<Role[]>(ROLES_KEY, context.getHandler());

      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
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

  return new RolesGuardImpl();
};
