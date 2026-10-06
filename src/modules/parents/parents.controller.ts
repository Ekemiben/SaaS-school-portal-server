import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ParentsService } from './parents.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get('portal/me')
  async getMyPortalProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.parentsService.getPortalProfile(tenant.tenantId, user?.id || user?.sub);
  }

  @Get('portal/wards/:studentId/attendance')
  async getWardAttendance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardAttendance(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/results')
  async getWardResults(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardResults(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/report-cards/:examinationId')
  async getWardReportCard(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.parentsService.getWardReportCard(
      tenant.tenantId,
      user?.id || user?.sub,
      studentId,
      examinationId,
    );
  }

  @Get('portal/wards/:studentId/timetable')
  async getWardTimetable(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardTimetable(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/homework')
  async getWardHomework(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardHomework(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/study-materials')
  async getWardStudyMaterials(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardStudyMaterials(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/medical')
  async getWardMedical(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardMedical(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/transport')
  async getWardTransport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardTransport(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/transcript')
  async getWardTranscript(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardTranscript(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/wards/:studentId/teachers')
  async getWardTeachers(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.parentsService.getWardTeachers(tenant.tenantId, user?.id || user?.sub, studentId);
  }

  @Get('portal/threads')
  async getParentThreads(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.parentsService.getParentThreads(tenant.tenantId, user?.id || user?.sub);
  }

  @Post('portal/threads')
  async createParentThread(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: { recipientUserId?: string; teacherId?: string; studentId?: string; subject: string; message: string },
  ) {
    return this.parentsService.createParentThread(tenant.tenantId, user?.id || user?.sub, body);
  }

  @Post('portal/threads/:threadId/messages')
  async sendThreadReply(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('threadId') threadId: string,
    @Body() body: { content: string },
  ) {
    return this.parentsService.sendThreadReply(tenant.tenantId, user?.id || user?.sub, threadId, body);
  }

  @Get('portal/announcements')
  async getPortalAnnouncements(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.parentsService.getPortalAnnouncements(tenant.tenantId, user?.id || user?.sub);
  }


  @RequirePermissions(SystemPermissions.PARENTS_VIEW)
  @Get()
  async listParents(@CurrentTenant() tenant: TenantContext) {
    return this.parentsService.findAll(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.PARENTS_VIEW)
  @Get(':id')
  async getParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.parentsService.findById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.PARENTS_MANAGE)
  @Post()
  async createParent(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.parentsService.create(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.PARENTS_MANAGE)
  @Patch(':id')
  async updateParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.parentsService.update(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.PARENTS_MANAGE)
  @Delete(':id')
  async deleteParent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.parentsService.delete(tenant.tenantId, id);
  }
}
