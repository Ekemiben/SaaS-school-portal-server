import { Controller, Get, Post, Patch, Delete, Body, Query, Param } from '@nestjs/common';
import { AcademicsService } from './academics.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';

@Controller(['api/v1/academics', 'academics'])
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  // --- Academic Calendar & Timeline ---
  @Get('calendar')
  async getAcademicCalendar(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.getAcademicCalendarSummary(tenant.tenantId);
  }

  // --- Academic Years ---
  @Get('years')
  async getYears(@CurrentTenant() tenant: TenantContext) {
    return this.academicsService.getAcademicYears(tenant.tenantId);
  }

  @Get('years/:id')
  async getYearById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.getAcademicYearById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('years')
  async createYear(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createAcademicYear(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Patch('years/:id')
  async updateYear(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.academicsService.updateAcademicYear(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('years/:id/set-current')
  async setCurrentYear(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.setCurrentAcademicYear(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Delete('years/:id')
  async deleteYear(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteAcademicYear(tenant.tenantId, id);
  }

  // --- Terms ---
  @Get('terms')
  async getTerms(
    @CurrentTenant() tenant: TenantContext,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academicsService.getTerms(tenant.tenantId, academicYearId);
  }

  @Get('terms/:id')
  async getTermById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.getTermById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('terms')
  async createTerm(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.academicsService.createTerm(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Patch('terms/:id')
  async updateTerm(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.academicsService.updateTerm(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('terms/:id/set-current')
  async setCurrentTerm(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.setCurrentTerm(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Delete('terms/:id')
  async deleteTerm(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteTerm(tenant.tenantId, id);
  }

  // --- Classes ---
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

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Post('classes/:id/assign-teacher')
  async assignTeacher(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { teacherId?: string | null },
  ) {
    return this.academicsService.assignTeacherToClass(tenant.tenantId, id, body.teacherId);
  }

  // --- Subjects ---
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

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Patch('subjects/:id')
  async updateSubject(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.academicsService.updateSubject(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.ACADEMICS_MANAGE)
  @Delete('subjects/:id')
  async deleteSubject(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteSubject(tenant.tenantId, id);
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

