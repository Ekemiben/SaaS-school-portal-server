import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { MeritAwardService } from '../services/merit-award.service.js';
import { ConductProfileService } from '../services/conduct-profile.service.js';
import { CreateMeritAwardDto, MeritFilterDto } from '../dto/merit-award.dto.js';
import { ConductFilterDto } from '../dto/conduct-filter.dto.js';

@Controller('api/v1/discipline')
export class MeritAwardsController {
  constructor(
    private readonly meritService: MeritAwardService,
    private readonly conductProfileService: ConductProfileService,
  ) {}

  @Post('merits')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  awardMerit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateMeritAwardDto,
  ) {
    return this.meritService.awardMerit(
      tenant.tenantId,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Get('merits')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getMerits(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: MeritFilterDto,
  ) {
    return this.meritService.getMerits(tenant.tenantId, filter);
  }

  @Get('merits/:id')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getMeritById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.meritService.getMeritById(tenant.tenantId, id);
  }

  @Get('students/:studentId/conduct-profile')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getStudentConductProfile(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
  ) {
    return this.conductProfileService.getStudentConductProfile(
      tenant.tenantId,
      studentId,
    );
  }

  @Get('reports/campus-summary')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getCampusConductSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: ConductFilterDto,
  ) {
    return this.conductProfileService.getCampusConductSummary(
      tenant.tenantId,
      filter,
    );
  }
}
