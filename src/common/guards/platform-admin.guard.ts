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

    if (!user || !user.isPlatformAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Platform administrator authorization required.',
      });
    }

    return true;
  }
}
