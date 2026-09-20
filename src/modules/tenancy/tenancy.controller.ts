import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Headers,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TenancyService } from './tenancy.service.js';
import { AddCustomDomainDto } from './dto/custom-domain.dto.js';
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
    @Query('slug') querySlug?: string,
    @Query('domain') queryDomain?: string,
  ) {
    const effectiveSlug = slug || querySlug;
    if (effectiveSlug) {
      return this.tenancyService.findBySlug(effectiveSlug);
    }
    const targetHost = customDomain || queryDomain || host;
    if (!targetHost) {
      return null;
    }
    return this.tenancyService.resolveByHostname(targetHost);
  }

  @Public()
  @Get('public-list')
  async listPublicSchools() {
    return this.tenancyService.listPublicSchools();
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
    if (!tenant?.tenantId) {
      return null;
    }
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
  @Get('domains')
  async listDomains(@CurrentTenant() tenant: TenantContext) {
    return this.tenancyService.listDomains(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.DOMAINS_MANAGE)
  @Post('domains/custom')
  async addCustomDomain(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: AddCustomDomainDto,
  ) {
    return this.tenancyService.addCustomDomain(tenant.tenantId, dto.domain);
  }

  @RequirePermissions(SystemPermissions.DOMAINS_MANAGE)
  @Post('domains/:domain/verify')
  async verifyCustomDomain(
    @CurrentTenant() tenant: TenantContext,
    @Param('domain') domain: string,
  ) {
    return this.tenancyService.verifyCustomDomain(tenant.tenantId, domain);
  }

  @RequirePermissions(SystemPermissions.DOMAINS_MANAGE)
  @Patch('domains/:domain/primary')
  async setPrimaryDomain(
    @CurrentTenant() tenant: TenantContext,
    @Param('domain') domain: string,
  ) {
    return this.tenancyService.setPrimaryDomain(tenant.tenantId, domain);
  }

  @RequirePermissions(SystemPermissions.DOMAINS_MANAGE)
  @Delete('domains/:domain')
  @HttpCode(HttpStatus.OK)
  async removeCustomDomain(
    @CurrentTenant() tenant: TenantContext,
    @Param('domain') domain: string,
  ) {
    return this.tenancyService.removeCustomDomain(tenant.tenantId, domain);
  }
}
