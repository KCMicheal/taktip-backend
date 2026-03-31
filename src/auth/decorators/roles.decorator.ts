import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]): PropertyDecorator => {
  return SetMetadata(ROLES_KEY, roles) as PropertyDecorator;
};

export const rolesDecorator = (...roles: Role[]): PropertyDecorator => Roles(...roles);
