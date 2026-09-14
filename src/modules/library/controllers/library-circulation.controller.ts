import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { BookCirculationService } from '../services/book-circulation.service.js';
import {
  IssueBookDto,
  ReturnBookDto,
  RenewBookDto,
} from '../dto/issue-book.dto.js';
import { IssueFilterDto } from '../dto/library-filter.dto.js';

@Controller('api/v1/library/circulation')
export class LibraryCirculationController {
  constructor(private readonly circulationService: BookCirculationService) {}

  @Post('issues')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  issueBook(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: IssueBookDto,
  ) {
    return this.circulationService.issueBook(
      tenant.tenantId,
      tenant.campusIds?.[0] || '',
      user?.sub || 'librarian_demo',
      dto,
    );
  }

  @Get('issues')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  listIssues(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: IssueFilterDto,
  ) {
    return this.circulationService.listIssues(tenant.tenantId, filter);
  }

  @Get('issues/:id')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getIssueById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.circulationService.getIssueById(tenant.tenantId, id);
  }

  @Post('issues/:id/return')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  returnBook(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReturnBookDto,
  ) {
    return this.circulationService.returnBook(
      tenant.tenantId,
      id,
      user?.sub || 'librarian_demo',
      dto,
    );
  }

  @Post('issues/:id/renew')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  renewBook(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: RenewBookDto,
  ) {
    return this.circulationService.renewBook(tenant.tenantId, id, dto);
  }
}
