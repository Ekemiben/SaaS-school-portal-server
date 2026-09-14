import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { DataImportService } from '../services/data-import.service.js';
import { CsvParserService } from '../services/csv-parser.service.js';
import {
  ImportStudentsDto,
  ImportParentsDto,
  ImportStaffDto,
  ImportGradesDto,
} from '../dto/import-data.dto.js';

@Controller('api/v1/data/import')
export class DataImportController {
  constructor(
    private readonly importService: DataImportService,
    private readonly csvParser: CsvParserService,
  ) {}

  @Get('template/:type')
  @RequirePermissions(SystemPermissions.DATA_IMPORT)
  getTemplate(@Param('type') type: string, @Res() res: Response) {
    const csv = this.csvParser.getSampleTemplate(type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_template.csv"`);
    return res.send(csv);
  }

  @Post('students')
  @RequirePermissions(SystemPermissions.DATA_IMPORT)
  importStudents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: ImportStudentsDto,
  ) {
    return this.importService.importStudents(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Post('parents')
  @RequirePermissions(SystemPermissions.DATA_IMPORT)
  importParents(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: ImportParentsDto,
  ) {
    return this.importService.importParents(
      tenant.tenantId,
      user?.id || 'system_user',
      dto,
    );
  }

  @Post('staff')
  @RequirePermissions(SystemPermissions.DATA_IMPORT)
  importStaff(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: ImportStaffDto,
  ) {
    return this.importService.importStaff(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Post('grades')
  @RequirePermissions(SystemPermissions.DATA_IMPORT)
  importGrades(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: ImportGradesDto,
  ) {
    return this.importService.importGrades(
      tenant.tenantId,
      tenant.campusIds?.[0],
      user?.id || 'system_user',
      dto,
    );
  }

  @Get('jobs')
  @RequirePermissions(SystemPermissions.DATA_IMPORT)
  getImportJobs(@CurrentTenant() tenant: TenantContext) {
    return this.importService.getImportJobs(tenant.tenantId);
  }
}
