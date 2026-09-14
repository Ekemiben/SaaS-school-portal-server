import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { DisciplinaryActionService } from '../services/disciplinary-action.service.js';
import { DetentionService } from '../services/detention.service.js';
import {
  CreateDisciplinaryActionDto,
  UpdateActionStatusDto,
} from '../dto/disciplinary-action.dto.js';
import {
  CreateDetentionSessionDto,
  AssignStudentDetentionDto,
  RecordDetentionAttendanceDto,
} from '../dto/detention.dto.js';

@Controller('api/v1/discipline')
export class DisciplineActionsController {
  constructor(
    private readonly actionService: DisciplinaryActionService,
    private readonly detentionService: DetentionService,
  ) {}

  // ----------------------------------------------------
  // Disciplinary Actions Endpoints
  // ----------------------------------------------------
  @Post('actions')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  assignAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateDisciplinaryActionDto,
  ) {
    return this.actionService.assignAction(
      tenant.tenantId,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Get('actions')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getActions(
    @CurrentTenant() tenant: TenantContext,
    @Query('studentId') studentId?: string,
    @Query('incidentId') incidentId?: string,
    @Query('status') status?: string,
  ) {
    return this.actionService.getActions(tenant.tenantId, { studentId, incidentId, status });
  }

  @Get('actions/:id')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getActionById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.actionService.getActionById(tenant.tenantId, id);
  }

  @Put('actions/:id/status')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  updateActionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateActionStatusDto,
  ) {
    return this.actionService.updateActionStatus(
      tenant.tenantId,
      id,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  // ----------------------------------------------------
  // Detention Sessions & Attendance Endpoints
  // ----------------------------------------------------
  @Post('detentions/sessions')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  createDetentionSession(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateDetentionSessionDto,
  ) {
    return this.detentionService.createSession(
      tenant.tenantId,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Get('detentions/sessions')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getDetentionSessions(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.detentionService.getSessions(tenant.tenantId, campusId);
  }

  @Get('detentions/sessions/:id')
  @RequirePermissions(SystemPermissions.DISCIPLINE_VIEW)
  getDetentionSessionById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.detentionService.getSessionById(tenant.tenantId, id);
  }

  @Post('detentions/assignments')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  assignStudentToDetention(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: AssignStudentDetentionDto,
  ) {
    return this.detentionService.assignStudent(
      tenant.tenantId,
      user?.sub || 'staff_demo',
      dto,
    );
  }

  @Put('detentions/assignments/:id/attendance')
  @RequirePermissions(SystemPermissions.DISCIPLINE_MANAGE)
  recordDetentionAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RecordDetentionAttendanceDto,
  ) {
    return this.detentionService.recordAttendance(
      tenant.tenantId,
      id,
      user?.sub || 'staff_demo',
      dto,
    );
  }
}
