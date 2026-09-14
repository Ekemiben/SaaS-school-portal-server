import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { HomeworkCoreService } from './services/homework-core.service.js';
import { HomeworkSubmissionService } from './services/homework-submission.service.js';
import { HomeworkGradingService } from './services/homework-grading.service.js';
import {
  CreateHomeworkDto,
  UpdateHomeworkDto,
  HomeworkFilterDto,
} from './dto/create-homework.dto.js';
import { SubmitHomeworkDto, ResubmitHomeworkDto } from './dto/submit-homework.dto.js';
import { GradeHomeworkDto, BulkGradeSubmissionDto } from './dto/grade-homework.dto.js';

@Controller('api/v1/homework')
export class HomeworkController {
  constructor(
    private readonly coreService: HomeworkCoreService,
    private readonly submissionService: HomeworkSubmissionService,
    private readonly gradingService: HomeworkGradingService,
  ) {}

  @Post()
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  createHomework(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateHomeworkDto,
  ) {
    return this.coreService.createHomework(tenant.tenantId, user?.sub || 'user_demo', dto);
  }

  @Get()
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getHomeworkList(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: HomeworkFilterDto,
  ) {
    return this.coreService.getHomeworkList(tenant.tenantId, filter);
  }

  @Get('class/:classId')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getHomeworkByClass(
    @CurrentTenant() tenant: TenantContext,
    @Param('classId') classId: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.coreService.getHomeworkList(tenant.tenantId, { classId, subjectId });
  }

  @Get('students/:studentId/submissions')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getStudentSubmissions(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
  ) {
    return this.submissionService.getStudentSubmissions(tenant.tenantId, studentId);
  }

  @Post('submissions/:submissionId/grade')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  gradeSubmission(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeHomeworkDto,
  ) {
    return this.gradingService.gradeSubmission(
      tenant.tenantId,
      submissionId,
      user?.sub || 'teacher_demo',
      dto,
    );
  }

  @Post('submissions/:submissionId/resubmit')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  resubmitHomework(
    @CurrentTenant() tenant: TenantContext,
    @Param('submissionId') submissionId: string,
    @Body() dto: ResubmitHomeworkDto,
  ) {
    return this.submissionService.resubmitHomework(tenant.tenantId, submissionId, dto);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getHomeworkById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.coreService.getHomeworkById(tenant.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  updateHomework(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateHomeworkDto,
  ) {
    return this.coreService.updateHomework(tenant.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  deleteHomework(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.coreService.deleteHomework(tenant.tenantId, id);
  }

  @Post(':id/submit')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  submitHomework(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: SubmitHomeworkDto,
  ) {
    return this.submissionService.submitHomework(tenant.tenantId, id, dto);
  }

  @Get(':id/submissions')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  getSubmissions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.submissionService.getSubmissions(tenant.tenantId, id);
  }

  @Get(':id/my-submission')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getMySubmission(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('studentId') studentId: string,
  ) {
    return this.submissionService.getMySubmission(tenant.tenantId, id, studentId);
  }

  @Post(':id/bulk-grade')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  bulkGrade(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: BulkGradeSubmissionDto,
  ) {
    return this.gradingService.bulkGrade(tenant.tenantId, id, user?.sub || 'teacher_demo', dto);
  }
}
