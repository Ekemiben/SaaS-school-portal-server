import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { HomeworkService } from './homework.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CreateHomeworkDto, SubmitHomeworkDto, GradeHomeworkDto } from './dto/create-homework.dto.js';

@Controller('api/v1/homework')
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Post()
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  createHomework(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateHomeworkDto,
  ) {
    return this.homeworkService.createHomework(tenant.tenantId, user?.sub || 'user_demo', dto);
  }

  @Get('class/:classId')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getHomeworkByClass(
    @CurrentTenant() tenant: TenantContext,
    @Param('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.homeworkService.getHomeworkByClass(tenant.tenantId, classId, subjectId);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getHomeworkById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.homeworkService.getHomeworkById(tenant.tenantId, id);
  }

  @Post(':id/submit')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  submitHomework(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: SubmitHomeworkDto,
  ) {
    return this.homeworkService.submitHomework(tenant.tenantId, id, dto);
  }

  @Get(':id/submissions')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  getSubmissions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.homeworkService.getSubmissions(tenant.tenantId, id);
  }

  @Post('submissions/:submissionId/grade')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  gradeSubmission(
    @CurrentTenant() tenant: TenantContext,
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeHomeworkDto,
  ) {
    return this.homeworkService.gradeSubmission(tenant.tenantId, submissionId, dto);
  }
}
