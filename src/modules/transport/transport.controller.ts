import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TransportService } from './transport.service.js';
import { TransportAllocationService } from './transport-allocation.service.js';
import { VehicleService } from './vehicle.service.js';
import { TripManagementService } from './trip-management.service.js';
import { TransportTrackingService } from './transport-tracking.service.js';
import { TransportAttendanceService } from './transport-attendance.service.js';
import { ParentLiveTrackingService } from './parent-live-tracking.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  CreateTransportRouteDto,
  UpdateTransportRouteDto,
  AllocateStudentTransportDto,
  UpdateTransportAllocationDto,
} from './dto/transport.dto.js';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  StartTripDto,
  UpdateTripStatusDto,
  RecordBoardingDto,
  IngestTelemetryDto,
} from './dto/fleet-and-trip.dto.js';
import { BatchBoardingCheckInDto, QueryTransportAttendanceDto } from './dto/transport-attendance.dto.js';
import { QueryParentLiveTrackingDto } from './dto/parent-live-tracking.dto.js';

@Controller('api/v1/transport')
export class TransportController {
  constructor(
    private readonly transportService: TransportService,
    private readonly allocationService: TransportAllocationService,
    private readonly vehicleService: VehicleService,
    private readonly tripService: TripManagementService,
    private readonly trackingService: TransportTrackingService,
    private readonly attendanceService: TransportAttendanceService,
    private readonly parentTrackingService: ParentLiveTrackingService,
  ) {}

  // --- Routes ---

  @Get('routes')
  async listRoutes(@CurrentTenant() tenant: TenantContext, @Query('campusId') campusId?: string) {
    return this.transportService.listRoutes(tenant.tenantId, campusId);
  }

  @Get('routes/:id')
  async getRoute(@CurrentTenant() tenant: TenantContext, @Param('id') routeId: string) {
    return this.transportService.getRouteById(tenant.tenantId, routeId);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('routes')
  async createRoute(@CurrentTenant() tenant: TenantContext, @Body() body: CreateTransportRouteDto) {
    return this.transportService.createRoute(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Patch('routes/:id')
  async updateRoute(@CurrentTenant() tenant: TenantContext, @Param('id') routeId: string, @Body() body: UpdateTransportRouteDto) {
    return this.transportService.updateRoute(tenant.tenantId, routeId, body);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Delete('routes/:id')
  async deleteRoute(@CurrentTenant() tenant: TenantContext, @Param('id') routeId: string) {
    return this.transportService.deleteRoute(tenant.tenantId, routeId);
  }

  // --- Allocations ---

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('allocations')
  async allocateStudent(@CurrentTenant() tenant: TenantContext, @Body() body: AllocateStudentTransportDto) {
    return this.allocationService.allocateStudent(tenant.tenantId, body);
  }

  @Get('allocations')
  async listAllocations(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
    @Query('routeId') routeId?: string,
    @Query('studentId') studentId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('status') status?: string,
  ) {
    return this.allocationService.listAllocations(tenant.tenantId, { campusId, routeId, studentId, academicYearId, status });
  }

  @Get('routes/:id/passengers')
  async getRoutePassengers(@CurrentTenant() tenant: TenantContext, @Param('id') routeId: string, @Query('academicYearId') academicYearId?: string) {
    return this.allocationService.getRoutePassengers(tenant.tenantId, routeId, academicYearId);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Patch('allocations/:id')
  async updateAllocation(@CurrentTenant() tenant: TenantContext, @Param('id') allocationId: string, @Body() body: UpdateTransportAllocationDto) {
    return this.allocationService.updateAllocation(tenant.tenantId, allocationId, body);
  }

  // --- Vehicles & Fleet ---

  @Get('vehicles')
  async listVehicles(@CurrentTenant() tenant: TenantContext, @Query('campusId') campusId?: string) {
    return this.vehicleService.listVehicles(tenant.tenantId, campusId);
  }

  @Get('vehicles/:id')
  async getVehicle(@CurrentTenant() tenant: TenantContext, @Param('id') vehicleId: string) {
    return this.vehicleService.getVehicleById(tenant.tenantId, vehicleId);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('vehicles')
  async createVehicle(@CurrentTenant() tenant: TenantContext, @Body() body: CreateVehicleDto) {
    return this.vehicleService.createVehicle(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Patch('vehicles/:id')
  async updateVehicle(@CurrentTenant() tenant: TenantContext, @Param('id') vehicleId: string, @Body() body: UpdateVehicleDto) {
    return this.vehicleService.updateVehicle(tenant.tenantId, vehicleId, body);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Delete('vehicles/:id')
  async deleteVehicle(@CurrentTenant() tenant: TenantContext, @Param('id') vehicleId: string) {
    return this.vehicleService.deleteVehicle(tenant.tenantId, vehicleId);
  }

  // --- Trip Management & Attendance ---

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('trips')
  async startTrip(@CurrentTenant() tenant: TenantContext, @Body() body: StartTripDto) {
    return this.tripService.startTrip(tenant.tenantId, body);
  }

  @Get('trips')
  async listTrips(
    @CurrentTenant() tenant: TenantContext,
    @Query('routeId') routeId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('status') status?: string,
    @Query('campusId') campusId?: string,
  ) {
    return this.tripService.listTrips(tenant.tenantId, { routeId, vehicleId, status, campusId });
  }

  @Get('trips/:id')
  async getTrip(@CurrentTenant() tenant: TenantContext, @Param('id') tripId: string) {
    return this.tripService.getTripDetails(tenant.tenantId, tripId);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Patch('trips/:id/status')
  async updateTripStatus(@CurrentTenant() tenant: TenantContext, @Param('id') tripId: string, @Body() body: UpdateTripStatusDto) {
    return this.tripService.updateTripStatus(tenant.tenantId, tripId, body);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('trips/:id/attendance')
  async recordCheckIn(@CurrentTenant() tenant: TenantContext, @Param('id') tripId: string, @Body() body: RecordBoardingDto) {
    return this.attendanceService.recordCheckIn(tenant.tenantId, tripId, body);
  }

  @RequirePermissions(SystemPermissions.TRANSPORT_MANAGE)
  @Post('trips/:id/attendance/batch')
  async batchCheckIn(@CurrentTenant() tenant: TenantContext, @Param('id') tripId: string, @Body() body: BatchBoardingCheckInDto) {
    return this.attendanceService.batchRecordCheckIn(tenant.tenantId, tripId, body.records);
  }

  @Get('attendance/student/:studentId')
  async getStudentAttendance(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Query() query: QueryTransportAttendanceDto,
  ) {
    return this.attendanceService.getStudentAttendanceHistory(tenant.tenantId, studentId, query);
  }

  // --- Tracking & Telemetry ---

  @Post('tracking/telemetry')
  async ingestTelemetry(@CurrentTenant() tenant: TenantContext, @Body() body: IngestTelemetryDto) {
    return this.trackingService.ingestTelemetry(tenant.tenantId, body);
  }

  @Get('tracking/trips/:id/latest')
  async getTripLiveLocation(@CurrentTenant() tenant: TenantContext, @Param('id') tripId: string) {
    return this.trackingService.getLatestLocation(tenant.tenantId, { tripId });
  }

  @Get('tracking/vehicles/:number/latest')
  async getVehicleLiveLocation(@CurrentTenant() tenant: TenantContext, @Param('number') vehicleNumber: string) {
    return this.trackingService.getLatestLocation(tenant.tenantId, { vehicleNumber });
  }

  // --- Parent Live Experience ---

  @Get('parent/student/:studentId/live')
  async getStudentLiveTracking(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Query() query: QueryParentLiveTrackingDto,
  ) {
    return this.parentTrackingService.getStudentLiveTransport(tenant.tenantId, studentId, {
      parentUserId: tenant.userId,
      query,
    });
  }

  @Get('parent/students/live')
  async getParentStudentsLiveTracking(@CurrentTenant() tenant: TenantContext) {
    return this.parentTrackingService.getParentStudentsLiveTransport(tenant.tenantId, tenant.userId || '');
  }
}



