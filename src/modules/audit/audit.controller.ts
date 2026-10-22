import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions(SystemPermissions.AUDIT_VIEW)
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ) {
    return this.auditService.list(tenant.tenantId, {
      limit,
      search,
      action,
      resourceType,
      startDate,
      endDate,
      status,
    });
  }
}
