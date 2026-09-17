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

    // Identify requested campusId from query, body, params, or x-campus-id header per Constitution Section 41
    const headerCampusId = request.headers['x-campus-id'];
    const requestedCampusId =
      request.params?.campusId ||
      request.query?.campusId ||
      request.body?.campusId ||
      (typeof headerCampusId === 'string' && headerCampusId.trim() ? headerCampusId.trim() : undefined);

    if (requestedCampusId) {
      request.campusId = requestedCampusId;
    }

    if (!user) {
      return true;
    }

    if (user.isPlatformAdmin) {
      return true;
    }

    if (!requestedCampusId) {
      return true;
    }

    const userRoles: string[] = (user.roles || []).map((r: any) =>
      typeof r === 'string' ? r : r?.name || '',
    );
    const isSchoolLevelAdmin =
      userRoles.includes('School Owner') ||
      userRoles.includes('School Admin') ||
      userRoles.includes('Super Admin') ||
      userRoles.includes('Owner') ||
      userRoles.includes('Admin');

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
