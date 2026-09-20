import { Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { AcademicsService } from './academics.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller('api/v1/academics')
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get('years')
  async getYears(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.getAcademicYears(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('years')
  async createYear(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createAcademicYear(tenant.tenantId, body);
  }

  @Get('terms')
  async getTerms(
    @CurrentTenant() tenant: TenantContext,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academicsService.getTerms(tenant.tenantId, academicYearId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('terms')
  async createTerm(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createTerm(tenant.tenantId, body);
  }

  @Get('classes')
  async getClasses(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.academicsService.getClasses(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('classes')
  async createClass(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createClass(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Patch('classes/:id')
  async updateClass(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.academicsService.updateClass(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Delete('classes/:id')
  async deleteClass(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteClass(tenant.tenantId, id);
  }

  @Get('subjects')
  async getSubjects(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.getSubjects(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('subjects')
  async createSubject(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createSubject(tenant.tenantId, body);
  }

  // --- Enrollments & Promotions ---
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('enrollments')
  async enrollStudent(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { studentId: string; classId: string; academicYearId: string; rollNumber?: string },
  ) {
    return this.academicsService.enrollStudent(tenant.tenantId, body);
  }

  @Get('classes/:classId/enrollments')
  async getClassEnrollments(
    @CurrentTenant() tenant: TenantContext,
    @Param('classId') classId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academicsService.getClassEnrollments(tenant.tenantId, classId, academicYearId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('enrollments/promote')
  async promoteStudents(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { fromClassId: string; toClassId: string; targetAcademicYearId: string; studentIds: string[] },
  ) {
    return this.academicsService.promoteStudents(tenant.tenantId, body);
  }

  // --- Class Subjects ---
  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('class-subjects')
  async assignClassSubject(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { classId: string; subjectId: string; teacherId: string; periodsPerWeek?: number },
  ) {
    return this.academicsService.assignClassSubject(tenant.tenantId, body);
  }

  @Get('classes/:classId/subjects')
  async getClassSubjects(
    @CurrentTenant() tenant: TenantContext,
    @Param('classId') classId: string,
  ) {
    return this.academicsService.getClassSubjects(tenant.tenantId, classId);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('initialize-default')
  async initializeDefault(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.initializeDefaultAcademicSetup(tenant.tenantId);
  }
}

