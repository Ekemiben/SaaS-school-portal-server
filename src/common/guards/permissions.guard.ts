import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // SUPER_ADMIN has unrestricted platform authority
    const userRole = user.role || (user.roles && user.roles[0]);
    if (
      userRole === 'SUPER_ADMIN' ||
      (user.roles && (user.roles.includes('SUPER_ADMIN') || (user.roles.includes('Super Admin') && user.scope === 'PLATFORM')))
    ) {
      return true;
    }

    const isPlatformUser = user.scope === 'PLATFORM' || user.tenantId === null || user.tenantId === undefined;
    const isPlatformPermission = requiredPermissions.some(
      (perm) => perm.startsWith('platform.') || perm === 'impersonate.user',
    );

    // Tenant users can never access platform-scoped permissions
    if (isPlatformPermission && !isPlatformUser) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'You do not have the required permissions to perform this action.',
      });
    }

    // School Owner has full access to tenant-scoped permissions
    const userRoles: string[] = user.roles || [];
    if (!isPlatformPermission && userRoles.includes('School Owner')) {
      return true;
    }

    const userPermissions: string[] = user.permissionIds || user.permissions || [];
    const hasAll =
      userPermissions.includes('*') ||
      requiredPermissions.every((perm) => userPermissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'You do not have the required permissions to perform this action.',
      });
    }

    return true;
  }
}
