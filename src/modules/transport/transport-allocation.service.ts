import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AllocateStudentTransportDto, UpdateTransportAllocationDto, AllocationStatus } from './dto/transport.dto.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TransportAllocationService {
  private readonly logger = new Logger(TransportAllocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async allocateStudent(tenantId: string, dto: AllocateStudentTransportDto) {
    if (this.prisma.isDbConnected) {
      // 1. Validate Student existence & tenant isolation
      const student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, tenantId },
      });
      if (!student) {
        throw new NotFoundException(`Student "${dto.studentId}" not found in this school organization.`);
      }

      // 2. Validate Route existence & tenant isolation
      const route = await this.prisma.transportRoute.findFirst({
        where: { id: dto.routeId, tenantId },
        include: { routeStops: true },
      });
      if (!route) {
        throw new NotFoundException(`Transport route "${dto.routeId}" not found in this school organization.`);
      }

      // Campus isolation check: If campusId is specified on student, route must match campus
      const campusId = dto.campusId || student.campusId || route.campusId;
      if (student.campusId && route.campusId && student.campusId !== route.campusId) {
        throw new BadRequestException('Student campus does not match route campus.');
      }

      // 3. Validate Academic Year existence
      const academicYear = await this.prisma.academicYear.findFirst({
        where: { id: dto.academicYearId, tenantId },
      });
      if (!academicYear) {
        throw new NotFoundException(`Academic year "${dto.academicYearId}" not found.`);
      }

      // 4. Duplicate Check: Prevent duplicate active allocation
      const existing = await this.prisma.studentTransportAllocation.findFirst({
        where: {
          tenantId,
          studentId: dto.studentId,
          academicYearId: dto.academicYearId,
          status: AllocationStatus.ACTIVE,
        },
      });
      if (existing) {
        throw new ConflictException('Student already has an active transport allocation for this academic year.');
      }

      // 5. Route Availability & Seating Capacity Validation
      const currentEnrolledCount = await this.prisma.studentTransportAllocation.count({
        where: {
          tenantId,
          routeId: dto.routeId,
          academicYearId: dto.academicYearId,
          status: AllocationStatus.ACTIVE,
        },
      });

      if (currentEnrolledCount >= route.capacity) {
        throw new BadRequestException(
          `Transport route "${route.routeName}" has reached its maximum passenger capacity (${route.capacity}).`,
        );
      }

      const initialHistory = [
        {
          action: 'ALLOCATED',
          status: AllocationStatus.ACTIVE,
          timestamp: new Date().toISOString(),
          notes: dto.notes || 'Initial transport route allocation',
        },
      ];

      return this.prisma.studentTransportAllocation.create({
        data: {
          tenantId,
          campusId,
          studentId: dto.studentId,
          routeId: dto.routeId,
          pickupStopId: dto.pickupStopId,
          pickupStopName: dto.pickupStopName,
          dropoffStopId: dto.dropoffStopId,
          dropoffStopName: dto.dropoffStopName,
          academicYearId: dto.academicYearId,
          termId: dto.termId,
          startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: AllocationStatus.ACTIVE,
          feeAmount: dto.feeAmount !== undefined ? dto.feeAmount : route.fee,
          notes: dto.notes,
          history: initialHistory,
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
          route: true,
        },
      });
    }

    // Memory Store Fallback
    const student = Array.from(this.prisma.memoryStore.students.values()).find(
      (s) => s.id === dto.studentId && s.tenantId === tenantId,
    );
    if (!student) throw new NotFoundException('Student not found in this school organization.');

    const route = Array.from(this.prisma.memoryStore.transportRoutes.values()).find(
      (r) => r.id === dto.routeId && r.tenantId === tenantId,
    );
    if (!route) throw new NotFoundException('Transport route not found in this school organization.');

    const campusId = dto.campusId || student.campusId || route.campusId;
    if (student.campusId && route.campusId && student.campusId !== route.campusId) {
      throw new BadRequestException('Student campus does not match route campus.');
    }

    const allocations = Array.from(this.prisma.memoryStore.studentTransportAllocations.values());
    const existing = allocations.find(
      (a) =>
        a.tenantId === tenantId &&
        a.studentId === dto.studentId &&
        a.academicYearId === dto.academicYearId &&
        a.status === AllocationStatus.ACTIVE,
    );
    if (existing) {
      throw new ConflictException('Student already has an active transport allocation for this academic year.');
    }

    const activeOnRoute = allocations.filter(
      (a) =>
        a.tenantId === tenantId &&
        a.routeId === dto.routeId &&
        a.academicYearId === dto.academicYearId &&
        a.status === AllocationStatus.ACTIVE,
    ).length;

    const routeCapacity = route.capacity || 30;
    if (activeOnRoute >= routeCapacity) {
      throw new BadRequestException(`Transport route has reached its maximum passenger capacity (${routeCapacity}).`);
    }

    const allocationId = `alloc_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const record = {
      id: allocationId,
      tenantId,
      campusId,
      studentId: dto.studentId,
      routeId: dto.routeId,
      pickupStopId: dto.pickupStopId,
      pickupStopName: dto.pickupStopName,
      dropoffStopId: dto.dropoffStopId,
      dropoffStopName: dto.dropoffStopName,
      academicYearId: dto.academicYearId,
      termId: dto.termId,
      startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      status: AllocationStatus.ACTIVE,
      feeAmount: dto.feeAmount !== undefined ? dto.feeAmount : (route.fee || 0),
      notes: dto.notes,
      history: [{ action: 'ALLOCATED', status: AllocationStatus.ACTIVE, timestamp: new Date().toISOString() }],
      createdAt: new Date(),
      updatedAt: new Date(),
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNumber: student.admissionNumber },
      route,
    };

    this.prisma.memoryStore.studentTransportAllocations.set(allocationId, record);
    return record;
  }

  async updateAllocation(tenantId: string, allocationId: string, dto: UpdateTransportAllocationDto) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.studentTransportAllocation.findFirst({
        where: { id: allocationId, tenantId },
      });
      if (!existing) {
        throw new NotFoundException(`Transport allocation "${allocationId}" not found.`);
      }

      const history = Array.isArray(existing.history) ? [...existing.history] : [];
      if (dto.status && dto.status !== existing.status) {
        history.push({
          action: 'STATUS_CHANGED',
          previousStatus: existing.status,
          newStatus: dto.status,
          reason: dto.reason,
          notes: dto.notes,
          timestamp: new Date().toISOString(),
        });
      }

      return this.prisma.studentTransportAllocation.update({
        where: { id: allocationId },
        data: {
          status: dto.status || existing.status,
          pickupStopName: dto.pickupStopName || existing.pickupStopName,
          dropoffStopName: dto.dropoffStopName || existing.dropoffStopName,
          notes: dto.notes || existing.notes,
          history,
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
          route: true,
        },
      });
    }

    const record = this.prisma.memoryStore.studentTransportAllocations.get(allocationId);
    if (!record || record.tenantId !== tenantId) {
      throw new NotFoundException('Transport allocation not found.');
    }

    const history = Array.isArray(record.history) ? [...record.history] : [];
    if (dto.status && dto.status !== record.status) {
      history.push({
        action: 'STATUS_CHANGED',
        previousStatus: record.status,
        newStatus: dto.status,
        reason: dto.reason,
        notes: dto.notes,
        timestamp: new Date().toISOString(),
      });
    }

    Object.assign(record, {
      status: dto.status || record.status,
      pickupStopName: dto.pickupStopName || record.pickupStopName,
      dropoffStopName: dto.dropoffStopName || record.dropoffStopName,
      notes: dto.notes || record.notes,
      history,
      updatedAt: new Date(),
    });

    this.prisma.memoryStore.studentTransportAllocations.set(allocationId, record);
    return record;
  }

  async listAllocations(
    tenantId: string,
    query: { campusId?: string; routeId?: string; studentId?: string; academicYearId?: string; status?: string },
  ) {
    if (this.prisma.isDbConnected) {
      return this.prisma.studentTransportAllocation.findMany({
        where: {
          tenantId,
          ...(query.campusId && { campusId: query.campusId }),
          ...(query.routeId && { routeId: query.routeId }),
          ...(query.studentId && { studentId: query.studentId }),
          ...(query.academicYearId && { academicYearId: query.academicYearId }),
          ...(query.status && { status: query.status }),
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
          route: true,
          campus: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return Array.from(this.prisma.memoryStore.studentTransportAllocations.values()).filter((a) => {
      if (a.tenantId !== tenantId) return false;
      if (query.campusId && a.campusId !== query.campusId) return false;
      if (query.routeId && a.routeId !== query.routeId) return false;
      if (query.studentId && a.studentId !== query.studentId) return false;
      if (query.academicYearId && a.academicYearId !== query.academicYearId) return false;
      if (query.status && a.status !== query.status) return false;
      return true;
    });
  }

  async getRoutePassengers(tenantId: string, routeId: string, academicYearId?: string) {
    return this.listAllocations(tenantId, {
      routeId,
      academicYearId,
      status: AllocationStatus.ACTIVE,
    });
  }
}
