import { Controller, Post, Get, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { CampusGuard } from '../../../common/guards/campus.guard.js';
import { StudentProgressionService } from '../services/student-progression.service.js';
import {
  PromoteStudentDto,
  BatchPromoteClassDto,
  RevertPromotionBatchDto,
} from '../dto/promote-student.dto.js';

@Controller('api/v1/students/progression')
@UseGuards(CampusGuard)
export class StudentProgressionController {
  constructor(private readonly progressionService: StudentProgressionService) {}

  @Post('promote-single/:id')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async promoteStudent(
    @Req() req: any,
    @Param('id') studentId: string,
    @Body() dto: PromoteStudentDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.progressionService.promoteStudent(tenantId, studentId, actorId, dto);
  }

  @Post('promote-batch')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async batchPromoteClass(
    @Req() req: any,
    @Body() dto: BatchPromoteClassDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.progressionService.batchPromoteClass(tenantId, actorId, dto);
  }

  @Post('revert-batch')
  @Permissions(SystemPermissions.STUDENTS_UPDATE)
  async revertPromotionBatch(
    @Req() req: any,
    @Body() dto: RevertPromotionBatchDto,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    const actorId = req.user?.id || req.user?.userId || 'system_admin';
    return this.progressionService.revertPromotionBatch(tenantId, actorId, dto);
  }

  @Get('batches')
  @Permissions(SystemPermissions.STUDENTS_VIEW)
  async getPromotionBatches(
    @Req() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    const tenantId = req.tenantId || req.tenant?.tenantId;
    return this.progressionService.getPromotionBatches(tenantId, academicYearId);
  }
}
