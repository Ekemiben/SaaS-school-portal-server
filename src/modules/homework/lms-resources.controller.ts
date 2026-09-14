import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { StudyMaterialService } from './services/study-material.service.js';
import { SyllabusService } from './services/syllabus.service.js';
import {
  CreateStudyMaterialDto,
  UpdateStudyMaterialDto,
  StudyMaterialFilterDto,
} from './dto/study-material.dto.js';
import {
  CreateSyllabusTopicDto,
  UpdateSyllabusTopicDto,
  CompleteSyllabusTopicDto,
} from './dto/syllabus-topic.dto.js';

@Controller('api/v1/homework')
export class LmsResourcesController {
  constructor(
    private readonly studyMaterialService: StudyMaterialService,
    private readonly syllabusService: SyllabusService,
  ) {}

  // ----------------------------------------------------
  // Study Materials & LMS Repository Endpoints
  // ----------------------------------------------------
  @Post('materials')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  createStudyMaterial(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateStudyMaterialDto,
  ) {
    return this.studyMaterialService.createStudyMaterial(
      tenant.tenantId,
      user?.sub || 'teacher_demo',
      dto,
    );
  }

  @Get('materials')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getStudyMaterials(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: StudyMaterialFilterDto,
  ) {
    return this.studyMaterialService.getStudyMaterials(tenant.tenantId, filter);
  }

  @Get('materials/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getStudyMaterialById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.studyMaterialService.getStudyMaterialById(tenant.tenantId, id);
  }

  @Get('materials/:id/download')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  downloadStudyMaterial(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.studyMaterialService.recordDownload(tenant.tenantId, id);
  }

  @Put('materials/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  updateStudyMaterial(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateStudyMaterialDto,
  ) {
    return this.studyMaterialService.updateStudyMaterial(tenant.tenantId, id, dto);
  }

  @Delete('materials/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  deleteStudyMaterial(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.studyMaterialService.deleteStudyMaterial(tenant.tenantId, id);
  }

  // ----------------------------------------------------
  // Curriculum Syllabus Topics Endpoints
  // ----------------------------------------------------
  @Post('syllabus')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  createSyllabusTopic(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateSyllabusTopicDto,
  ) {
    return this.syllabusService.createSyllabusTopic(
      tenant.tenantId,
      user?.sub || 'teacher_demo',
      dto,
    );
  }

  @Get('syllabus')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getSyllabusTopics(
    @CurrentTenant() tenant: TenantContext,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.syllabusService.getSyllabusTopics(tenant.tenantId, classId, subjectId);
  }

  @Get('syllabus/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_VIEW)
  getSyllabusTopicById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.syllabusService.getSyllabusTopicById(tenant.tenantId, id);
  }

  @Put('syllabus/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  updateSyllabusTopic(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateSyllabusTopicDto,
  ) {
    return this.syllabusService.updateSyllabusTopic(tenant.tenantId, id, dto);
  }

  @Put('syllabus/:id/complete')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  completeSyllabusTopic(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CompleteSyllabusTopicDto,
  ) {
    return this.syllabusService.completeSyllabusTopic(
      tenant.tenantId,
      id,
      user?.sub || 'teacher_demo',
      dto,
    );
  }

  @Delete('syllabus/:id')
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  deleteSyllabusTopic(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.syllabusService.deleteSyllabusTopic(tenant.tenantId, id);
  }
}
