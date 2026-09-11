import { Controller, Post, Get, Body, Res } from '@nestjs/common';
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
  @Post('login')
  async login(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      tenant?.tenantId || 'tenant_greenfield_100',
      body.email,
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
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerSchoolOwner(
      tenant?.tenantId || 'tenant_greenfield_100',
      {
        email: body.email,
        passwordPlain: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
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
    return this.authService.getProfile(user.id, tenant.tenantId);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(
    @CurrentTenant() tenant: TenantContext,
    @Body('email') email: string,
  ) {
    return this.authService.forgotPassword(tenant.tenantId, email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { token: string; newPassword: string },
  ) {
    return this.authService.resetPassword(tenant.tenantId, body.token, body.newPassword);
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
