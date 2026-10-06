import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, NotFoundException } from '@nestjs/common';
import { TeachersService } from './teachers.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/create-teacher.dto.js';

@Controller('api/v1/teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get()
  async listTeachers(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.teachersService.findAll(tenant.tenantId, campusId);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_VIEW)
  @Get(':id')
  async getTeacher(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    if (id === 'departments' || id === 'designations' || id === 'staff-rooms') {
      throw new NotFoundException(`Invalid staff ID "${id}".`);
    }
    return this.teachersService.findById(tenant.tenantId, id);
  }


  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Post()
  async createTeacher(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: any,
    @Body() body: CreateTeacherDto,
  ) {
    return this.teachersService.create(tenant.tenantId, body, req.user);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Patch(':id')
  async updateTeacher(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateTeacherDto,
  ) {
    return this.teachersService.update(tenant.tenantId, id, body, req.user);
  }

  @RequirePermissions(SystemPermissions.TEACHERS_MANAGE)
  @Delete(':id')
  async deleteTeacher(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.teachersService.delete(tenant.tenantId, id);
  }
}
