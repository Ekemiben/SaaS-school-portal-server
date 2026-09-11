import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantContext = request.tenantContext;

    // If endpoint has no user yet or is platform-only, let downstream guards handle
    if (!user) {
      return true;
    }

    // Platform admin bypass
    if (user.isPlatformAdmin) {
      return true;
    }

    // If no tenant context was established
    if (!tenantContext || !tenantContext.tenantId) {
      throw new ForbiddenException({
        code: ErrorCodes.TENANT_NOT_FOUND,
        message: 'Tenant context could not be established for this request',
      });
    }

    // Critical tenant isolation rule: authenticated user must belong to resolved tenant
    if (user.tenantId !== tenantContext.tenantId) {
      throw new ForbiddenException({
        code: ErrorCodes.TENANT_ACCESS_DENIED,
        message: 'You are not authorized to access resources belonging to this school organization.',
      });
    }

    return true;
  }
}
