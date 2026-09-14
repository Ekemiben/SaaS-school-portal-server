import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { DisciplineIncidentService } from '../services/discipline-incident.service.js';
import {
  CreateDisciplineIncidentDto,
  IncidentFilterDto,
} from '../dto/create-incident.dto.js';
import {
  UpdateDisciplineIncidentDto,
  ResolveIncidentDto,
} from '../dto/update-incident.dto.js';

@Controller('api/v1/discipline/incidents')
export class DisciplineIncidentsController {
  constructor(private readonly incidentService: DisciplineIncidentService) {}

  @Post()
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  reportIncident(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateDisciplineIncidentDto,
  ) {
    return this.incidentService.reportIncident(
      tenant.tenantId,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Get()
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getIncidents(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: IncidentFilterDto,
  ) {
    return this.incidentService.getIncidents(tenant.tenantId, filter);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getIncidentById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.incidentService.getIncidentById(tenant.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  updateIncident(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateDisciplineIncidentDto,
  ) {
    return this.incidentService.updateIncident(tenant.tenantId, id, dto);
  }

  @Put(':id/resolve')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  resolveIncident(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ResolveIncidentDto,
  ) {
    return this.incidentService.resolveIncident(
      tenant.tenantId,
      id,
      user?.sub || 'staff_demo',
      dto,
    );
  }
}
