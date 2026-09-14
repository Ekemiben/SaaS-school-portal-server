import { Controller, Post, Get, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { CampusGuard } from '../../../common/guards/campus.guard.js';
import { StudentLifecycleService } from '../services/student-lifecycle.service.js';
import { StudentTransferService } from '../services/student-transfer.service.js';
import {
  SuspendStudentDto,
  ReinstateStudentDto,
  WithdrawStudentDto,
  GraduateStudentDto,
  AlumniFilterDto,
} from '../dto/student-lifecycle.dto.js';
import { TransferStudentClassDto, TransferStudentCampusDto } from '../dto/transfer-student.dto.js';

@Controller('api/v1/students/lifecycle')
@UseGuards(CampusGuard)
export class StudentLifecycleController {
  constructor(
    private readonly lifecycleService: StudentLifecycleService,
    private readonly transferService: StudentTransferService,
  ) {}

  @Post('transfer-class/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async transferClass(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: TransferStudentClassDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.transferService.transferClass(tenantId, studentId, actorId, dto);
  }

  @Post('transfer-campus/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async transferCampus(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: TransferStudentCampusDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.transferService.transferCampus(tenantId, studentId, actorId, dto);
  }

  @Post('suspend/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async suspendStudent(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: SuspendStudentDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.lifecycleService.suspendStudent(tenantId, studentId, actorId, dto);
  }

  @Post('reinstate/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async reinstateStudent(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: ReinstateStudentDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.lifecycleService.reinstateStudent(tenantId, studentId, actorId, dto);
  }

  @Post('withdraw/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async withdrawStudent(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: WithdrawStudentDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.lifecycleService.withdrawStudent(tenantId, studentId, actorId, dto);
  }

  @Post('graduate/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async graduateStudent(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: GraduateStudentDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.lifecycleService.graduateStudent(tenantId, studentId, actorId, dto);
  }

  @Get('history/:id')
  @Permissions(SystemPermissions.STUDENTS_VIEW)
  async getStudentTimeline(
    @Req() req: any,
    @Param('id') studentId: string,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    return this.lifecycleService.getStudentTimeline(tenantId, studentId);
  }

  @Get('alumni')
  @Permissions(SystemPermissions.STUDENTS_VIEW)
  async getAlumniRecords(
    @Req() req: any,
    @Query() filter: AlumniFilterDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    return this.lifecycleService.getAlumniRecords(tenantId, filter);
  }
}
