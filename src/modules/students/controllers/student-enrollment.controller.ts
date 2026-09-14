import { Controller, Post, Get, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { CampusGuard } from '../../../common/guards/campus.guard.js';
import { StudentEnrollmentService } from '../services/student-enrollment.service.js';
import { EnrollFromOfferDto, DirectEnrollStudentDto } from '../dto/enroll-student.dto.js';

@Controller('api/v1/students/enrollment')
@UseGuards(CampusGuard)
export class StudentEnrollmentController {
  constructor(private readonly enrollmentService: StudentEnrollmentService) {}

  @Post('from-offer')
  @Permissions(SystemPermissions.STUDENTS_CREATE)
  async enrollFromOffer(@Req() req: any, @Body() dto: EnrollFromOfferDto) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.enrollmentService.enrollFromOffer(tenantId, actorId, dto);
  }

  @Post('direct')
  @Permissions(SystemPermissions.STUDENTS_CREATE)
  async directEnroll(@Req() req: any, @Body() dto: DirectEnrollStudentDto) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.enrollmentService.directEnroll(tenantId, actorId, dto);
  }

  @Get('preview-admission-number')
  @Permissions(SystemPermissions.STUDENTS_VIEW)
  async previewAdmissionNumber(
    @Req() req: any,
    @Query('year') year?: string,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const y = year ? parseInt(year, 10) : undefined;
    return { admissionNumber: this.enrollmentService.generateAdmissionNumber(tenantId, y) };
  }
}
