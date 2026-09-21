import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CampusGuard } from '../../common/guards/campus.guard.js';

@Controller('api/v1/students')
@UseGuards(CampusGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @RequirePermissions(SystemPermissions.STUDENTS_VIEW)
  @Get()
  async listStudents(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
    @Query('classId') classId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.studentsService.findAll(tenant.tenantId, {
      campusId,
      classId,
      status,
      search,
      page,
      limit,
    });
  }

  @Get('portal/me')
  async getMyPortalProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.studentsService.getPortalProfile(tenant.tenantId, user?.id || user?.sub);
  }

  @RequirePermissions(SystemPermissions.STUDENTS_VIEW)
  @Get(':id')
  async getStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.studentsService.findById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.STUDENTS_CREATE)
  @Post()
  async createStudent(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: any,
  ) {
    return this.studentsService.create(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.STUDENTS_UPDATE)
  @Patch(':id')
  async updateStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.studentsService.update(tenant.tenantId, id, body);
  }

  @RequirePermissions(SystemPermissions.STUDENTS_DELETE)
  @Delete(':id')
  async deleteStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.studentsService.delete(tenant.tenantId, id);
  }
}
