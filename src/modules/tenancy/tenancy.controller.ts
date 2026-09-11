import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Headers,
  Param,
} from '@nestjs/common';
import { TenancyService } from './tenancy.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/tenant')
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Public()
  @Get('public-config')
  async getPublicConfig(
    @Headers('host') host: string,
    @Headers('x-tenant-domain') customDomain?: string,
    @Headers('x-tenant-slug') slug?: string,
  ) {
    if (slug) {
      return this.tenancyService.findBySlug(slug);
    }
    const targetHost = customDomain || host || 'localhost';
    return this.tenancyService.resolveByHostname(targetHost);
  }

  @Public()
  @Post('register')
  async registerSchool(
    @Body()
    body: {
      schoolName: string;
      slug: string;
      ownerEmail: string;
      country?: string;
      currency?: string;
    },
  ) {
    return this.tenancyService.registerSchool(body);
  }

  @Get('current')
  async getCurrentTenant(@CurrentTenant() tenant: TenantContext) {
    return this.tenancyService.resolveCurrentTenant(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.SETTINGS_MANAGE)
  @Patch('branding')
  async updateBranding(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      name?: string;
      logoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      timezone?: string;
      locale?: string;
      currency?: string;
    },
  ) {
    return this.tenancyService.updateBranding(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.DOMAINS_MANAGE)
  @Post('domains/custom')
  async addCustomDomain(
    @CurrentTenant() tenant: TenantContext,
    @Body('domain') domain: string,
  ) {
    return this.tenancyService.addCustomDomain(tenant.tenantId, domain);
  }

  @RequirePermissions(SystemPermissions.DOMAINS_MANAGE)
  @Post('domains/:domain/verify')
  async verifyCustomDomain(
    @CurrentTenant() tenant: TenantContext,
    @Param('domain') domain: string,
  ) {
    return this.tenancyService.verifyCustomDomain(tenant.tenantId, domain);
  }
}
