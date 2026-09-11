import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class CampusGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true;
    }

    if (user.isPlatformAdmin) {
      return true;
    }

    // Identify requested campusId from query, body, or params
    const requestedCampusId =
      request.params?.campusId ||
      request.query?.campusId ||
      request.body?.campusId;

    if (!requestedCampusId) {
      return true;
    }

    const userRoles: string[] = user.roles || [];
    const isSchoolLevelAdmin =
      userRoles.includes('School Owner') ||
      userRoles.includes('School Admin') ||
      userRoles.includes('Super Admin');

    if (isSchoolLevelAdmin) {
      return true;
    }

    // Check assigned user campus IDs
    const allowedCampuses: string[] = user.campusIds || [];
    if (allowedCampuses.length > 0 && !allowedCampuses.includes(requestedCampusId)) {
      throw new ForbiddenException({
        code: ErrorCodes.CAMPUS_ACCESS_DENIED,
        message: 'You are not authorized to access this campus.',
      });
    }

    return true;
  }
}
