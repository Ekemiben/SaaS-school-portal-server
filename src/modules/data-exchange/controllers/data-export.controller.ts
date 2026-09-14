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
import { DataExportService } from '../services/data-export.service.js';
import { CreateExportJobDto, ExportJobFilterDto } from '../dto/export-data.dto.js';

@Controller('api/v1/data/export')
export class DataExportController {
  constructor(private readonly exportService: DataExportService) {}

  @Post('jobs')
  @RequirePermissions(SystemPermissions.DATA_EXPORT)
  createExportJob(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: CreateExportJobDto,
  ) {
    return this.exportService.createExportJob(
      tenant.tenantId,
      user?.id || 'system_user',
      dto,
    );
  }

  @Get('jobs')
  @RequirePermissions(SystemPermissions.DATA_EXPORT)
  listExportJobs(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: ExportJobFilterDto,
  ) {
    return this.exportService.listExportJobs(tenant.tenantId, filter);
  }

  @Get('jobs/:id')
  @RequirePermissions(SystemPermissions.DATA_EXPORT)
  getExportJob(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.exportService.getExportJob(tenant.tenantId, id);
  }

  @Get('backup/full-snapshot')
  @RequirePermissions(SystemPermissions.DATA_BACKUP)
  getFullBackupSnapshot(
    @CurrentTenant() tenant: TenantContext,
    @Query('anonymize') anonymize?: string,
  ) {
    return this.exportService.getFullTenantBackupSnapshot(
      tenant.tenantId,
      anonymize === 'true' || anonymize === '1',
    );
  }

  @Get('instant/csv')
  @RequirePermissions(SystemPermissions.DATA_EXPORT)
  async exportInstantCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query('entity') entity: string,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.exportEntityCsv(
      tenant.tenantId,
      entity || 'students',
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${entity || 'students'}_export.csv"`);
    return res.send(csv);
  }
}
