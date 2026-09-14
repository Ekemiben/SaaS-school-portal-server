import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../../common/constants/permissions.js';
import { BookCatalogService } from '../services/book-catalog.service.js';
import {
  CreateBookDto,
  UpdateBookDto,
  CreateBookCopyDto,
  UpdateBookCopyDto,
} from '../dto/create-book.dto.js';
import {
  BookFilterDto,
  BookCopyFilterDto,
} from '../dto/library-filter.dto.js';

@Controller('api/v1/library')
export class LibraryCatalogController {
  constructor(private readonly catalogService: BookCatalogService) {}

  @Post('books')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  createBook(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateBookDto,
  ) {
    return this.catalogService.createBook(tenant.tenantId, tenant.campusIds?.[0] || '', dto);
  }

  @Get('books')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  listBooks(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: BookFilterDto,
  ) {
    return this.catalogService.listBooks(tenant.tenantId, filter);
  }

  @Get('books/:id')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getBookById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.catalogService.getBookById(tenant.tenantId, id);
  }

  @Patch('books/:id')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  updateBook(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
  ) {
    return this.catalogService.updateBook(tenant.tenantId, id, dto);
  }

  // --- Physical Copies / Barcodes ---

  @Post('copies')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  createBookCopy(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateBookCopyDto,
  ) {
    return this.catalogService.createBookCopy(tenant.tenantId, tenant.campusIds?.[0] || '', dto);
  }

  @Get('copies')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  listBookCopies(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: BookCopyFilterDto,
  ) {
    return this.catalogService.listBookCopies(tenant.tenantId, filter);
  }

  @Get('copies/tag/:barcode')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getBookCopyByBarcode(
    @CurrentTenant() tenant: TenantContext,
    @Param('barcode') barcode: string,
  ) {
    return this.catalogService.getBookCopyByBarcode(tenant.tenantId, barcode);
  }

  @Get('copies/:id')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getBookCopyById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.catalogService.getBookCopyById(tenant.tenantId, id);
  }

  @Patch('copies/:id')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  updateBookCopy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateBookCopyDto,
  ) {
    return this.catalogService.updateBookCopy(tenant.tenantId, id, dto);
  }
}
