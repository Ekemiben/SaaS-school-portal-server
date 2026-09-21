import { Controller, Post, Get, Body, Res, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import type { Response } from 'express';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('platform/login')
  async platformLogin(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.platformLogin(
      body.email,
      body.password,
    );

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });

    return result;
  }

  @Public()
  @Post('login')
  async login(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { email?: string; identifier?: string; password: string; tenantId?: string; tenantSlug?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const loginIdentifier = (body.identifier || body.email || '').trim();
    const rawIdentifier = body.tenantSlug || body.tenantId || tenant?.slug || tenant?.tenantId;

    if (!rawIdentifier) {
      // Platform root domain sign-in without explicit school identifier
      // Allow platform administrators (tenantId === null) to authenticate
      const isPlatform = await this.authService.isPlatformUser(loginIdentifier);
      if (isPlatform) {
        const platformResult = await this.authService.platformLogin(loginIdentifier, body.password);
        res.cookie('accessToken', platformResult.accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 3600 * 1000,
        });
        return platformResult;
      }

      // School user must explicitly provide school slug/domain
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'School portal identifier is required. Please specify your school subdomain to sign in.',
      });
    }

    // Explicit tenant resolution against authoritative PostgreSQL
    const resolvedTenant = await this.authService.resolveTenantForAuth(rawIdentifier);
    if (!resolvedTenant) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: 'School portal could not be found. Please check your school subdomain.',
      });
    }

    if (resolvedTenant.status === 'SUSPENDED' || resolvedTenant.status === 'DELETED') {
      throw new UnauthorizedException({
        code: 'TENANT_SUSPENDED',
        message: 'This school portal has been suspended or deactivated.',
      });
    }

    // Authenticate credentials strictly inside the resolved tenant
    const result = await this.authService.login(
      resolvedTenant.id,
      loginIdentifier,
      body.password,
    );

    // Set secure HttpOnly cookie for session security (Section 10)
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });

    return result;
  }

  @Public()
  @Post('register-owner')
  async registerOwner(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      tenantId?: string;
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      phone?: string;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const targetTenantId = body.tenantId || tenant?.tenantId;
    if (!targetTenantId) {
      throw new BadRequestException('A valid school tenantId is required for school owner registration.');
    }

    const nameParts = (body.firstName ? `${body.firstName} ${body.lastName || ''}` : (body.name || 'School Owner')).trim().split(/\s+/);
    const firstName = body.firstName || nameParts[0] || 'School';
    const lastName = body.lastName || nameParts.slice(1).join(' ') || 'Owner';

    const result = await this.authService.registerSchoolOwner(
      targetTenantId,
      {
        email: body.email,
        passwordPlain: body.password,
        firstName,
        lastName,
        phone: body.phone,
      },
    );

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });

    return result;
  }

  @Public()
  @Post('refresh')
  async refreshToken(
    @Body('refreshToken') refreshToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshToken(refreshToken);
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });
    return result;
  }

  @Get('me')
  async me(
    @CurrentUser() user: any,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.authService.getProfile(user?.id || user?.sub, tenant?.tenantId);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(
    @CurrentTenant() tenant: TenantContext,
    @Body('email') email: string,
    @Body('tenantId') bodyTenantId?: string,
    @Body('tenantSlug') bodyTenantSlug?: string,
  ) {
    const rawIdentifier = bodyTenantSlug || bodyTenantId || tenant?.slug || tenant?.tenantId;
    if (!rawIdentifier) {
      const isPlatform = await this.authService.isPlatformUser(email);
      if (isPlatform) {
        return this.authService.forgotPassword(null, email);
      }
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'School portal identifier is required for password recovery.',
      });
    }

    const resolvedTenant = await this.authService.resolveTenantForAuth(rawIdentifier);
    if (!resolvedTenant) {
      return { success: true, message: 'If an account exists, a password reset link has been dispatched.' };
    }

    return this.authService.forgotPassword(resolvedTenant.id, email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { token: string; newPassword: string; tenantId?: string; tenantSlug?: string },
  ) {
    const targetTenant = body.tenantId || body.tenantSlug || tenant?.tenantId || tenant?.slug || undefined;
    return this.authService.resetPassword(targetTenant, body.token, body.newPassword);
  }

  @Post('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      user.id,
      tenant.tenantId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('switch-campus')
  async switchCampus(
    @CurrentUser() user: any,
    @CurrentTenant() tenant: TenantContext,
    @Body('campusId') campusId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.switchCampus(user.id, tenant.tenantId, campusId);
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });
    return result;
  }

  @Post('2fa/generate')
  async generate2fa(
    @CurrentUser() user: any,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.authService.setup2FA(user.id, tenant.tenantId);
  }

  @Post('2fa/verify')
  async verify2fa(
    @CurrentUser() user: any,
    @CurrentTenant() tenant: TenantContext,
    @Body('code') code: string,
  ) {
    return this.authService.verify2FA(user.id, tenant.tenantId, code);
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('accessToken');
    return { success: true, message: 'Logged out successfully' };
  }
}
