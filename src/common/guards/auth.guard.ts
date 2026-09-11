import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (request.cookies && request.cookies.accessToken) {
      token = request.cookies.accessToken;
    }

    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication token missing or invalid',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_key_change_in_production_123',
      });

      request.user = payload;

      // Update tenant context with user identity if available
      if (request.tenantContext) {
        request.tenantContext.userId = payload.sub || payload.id;
        request.tenantContext.email = payload.email;
        request.tenantContext.roleIds = payload.roleIds || [];
        request.tenantContext.permissionIds = payload.permissionIds || [];
        request.tenantContext.campusIds = payload.campusIds || [];
        request.tenantContext.isPlatformAdmin = !!payload.isPlatformAdmin;
      }

      return true;
    } catch {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid or expired session. Please log in again.',
      });
    }
  }
}
