import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { ImpersonationService } from '../services/impersonation.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  StartImpersonationDto,
  TerminateImpersonationDto,
  ImpersonationFilterDto,
} from '../dto/impersonation.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard.js';
import { PermissionsGuard } from '../../../common/guards/permissions.guard.js';

@Controller('api/v1/platform/impersonation')
@UseGuards(AuthGuard, PlatformAdminGuard, PermissionsGuard)
export class ImpersonationController {
  constructor(
    private readonly impersonationService: ImpersonationService,
    private readonly auditService: AuditService,
  ) {}

  @Post('start')
  @RequirePermissions(SystemPermissions.PLATFORM_IMPERSONATION_START)
  startImpersonation(
    @CurrentUser() user: any,
    @Body() dto: StartImpersonationDto,
    @Req() req: any,
  ) {
    return this.impersonationService.startImpersonation(user, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Get('sessions')
  @RequirePermissions(SystemPermissions.PLATFORM_IMPERSONATION_START)
  listSessions(@Query() filter: ImpersonationFilterDto) {
    return this.impersonationService.listSessions(filter);
  }

  @Post('sessions/:id/terminate')
  @RequirePermissions(SystemPermissions.PLATFORM_IMPERSONATION_START)
  terminateSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: any,
    @Body() dto: TerminateImpersonationDto,
  ) {
    return this.impersonationService.terminateImpersonation(
      sessionId,
      user?.id || 'superadmin_system',
      dto,
    );
  }

  @Get('audit-logs')
  @RequirePermissions(SystemPermissions.PLATFORM_AUDIT_VIEW)
  getImpersonationAuditLogs(
    @Query('tenantId') tenantId?: string,
    @Query('impersonatedBy') impersonatedBy?: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.listPlatformAuditLogs({
      tenantId,
      impersonatedBy,
      isImpersonated: true,
      limit: limit ? Number(limit) : 100,
    });
  }
}
