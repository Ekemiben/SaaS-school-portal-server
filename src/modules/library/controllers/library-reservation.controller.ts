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
import { BookReservationService } from '../services/book-reservation.service.js';
import {
  CreateBookReservationDto,
  UpdateReservationDto,
} from '../dto/reservation.dto.js';
import { ReservationFilterDto } from '../dto/library-filter.dto.js';

@Controller('api/v1/library/reservations')
export class LibraryReservationController {
  constructor(private readonly reservationService: BookReservationService) {}

  @Post()
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  reserveBook(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateBookReservationDto,
  ) {
    return this.reservationService.reserveBook(
      tenant.tenantId,
      tenant.campusIds?.[0] || '',
      dto,
    );
  }

  @Get()
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  listReservations(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: ReservationFilterDto,
  ) {
    return this.reservationService.listReservations(tenant.tenantId, filter);
  }

  @Get(':id')
  @RequirePermissions(SystemPermissions.LIBRARY_VIEW)
  getReservationById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.reservationService.getReservationById(tenant.tenantId, id);
  }

  @Post(':id/cancel')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  cancelReservation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.reservationService.cancelReservation(tenant.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions(SystemPermissions.LIBRARY_MANAGE)
  updateReservation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateReservationDto,
  ) {
    return this.reservationService.updateReservation(tenant.tenantId, id, dto);
  }
}
