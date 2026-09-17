import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Platform administrator authorization required.',
      });
    }

    const validPlatformRoles = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT'];
    const userRole = user.role || (user.roles && user.roles[0]);
    const isPlatform =
      user.scope === 'PLATFORM' ||
      user.tenantId === null ||
      user.tenantId === undefined ||
      validPlatformRoles.includes(userRole) ||
      user.isPlatformAdmin;

    if (!isPlatform) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Platform administrator authorization required.',
      });
    }

    return true;
  }
}
