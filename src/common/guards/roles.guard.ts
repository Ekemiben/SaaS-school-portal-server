import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    const userRole = user.role || (user.roles && user.roles[0]);
    if (
      userRole === 'SUPER_ADMIN' ||
      (user.roles && (user.roles.includes('SUPER_ADMIN') || (user.roles.includes('Super Admin') && user.scope === 'PLATFORM')))
    ) {
      return true;
    }

    const userRoles: string[] = user.roles || (userRole ? [userRole] : []);
    const hasRole = requiredRoles.some((role) => userRoles.includes(role) || userRole === role);

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Your role does not permit access to this resource.',
      });
    }

    return true;
  }
}
