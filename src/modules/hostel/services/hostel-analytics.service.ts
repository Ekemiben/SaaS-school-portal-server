import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { HostelSummaryFilterDto } from '../dto/hostel-filter.dto.js';

@Injectable()
export class HostelAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHostelSummary(tenantId: string, filter?: HostelSummaryFilterDto) {
    let hostels = Array.from(this.prisma.memoryStore.hostels.values()).filter(
      (h) => h.tenantId === tenantId,
    );
    if (filter?.campusId) hostels = hostels.filter((h) => h.campusId === filter.campusId);

    const rooms = Array.from(this.prisma.memoryStore.hostelRooms.values()).filter(
      (r) => r.tenantId === tenantId && (!filter?.campusId || r.campusId === filter.campusId),
    );
    const beds = Array.from(this.prisma.memoryStore.hostelBeds.values()).filter(
      (b) => b.tenantId === tenantId && (!filter?.campusId || b.campusId === filter.campusId),
    );

    const totalHostels = hostels.length;
    const totalRooms = rooms.length;
    const totalCapacity = beds.length;
    const totalOccupied = beds.filter((b) => b.status === 'OCCUPIED').length;
    const totalVacant = Math.max(0, totalCapacity - totalOccupied);
    const occupancyRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

    const genderBreakdown = {
      boys: hostels.filter((h) => h.gender === 'BOYS').length,
      girls: hostels.filter((h) => h.gender === 'GIRLS').length,
      mixed: hostels.filter((h) => h.gender === 'MIXED').length,
    };

    const exeats = Array.from(this.prisma.memoryStore.hostelExeats.values()).filter(
      (e) => e.tenantId === tenantId && (!filter?.campusId || e.campusId === filter.campusId),
    );
    const activeDepartedExeats = exeats.filter((e) => e.status === 'DEPARTED').length;
    const overdueExeats = exeats.filter((e) => e.status === 'OVERDUE').length;
    const pendingExeats = exeats.filter(
      (e) => e.status === 'PENDING_APPROVAL' || e.status === 'PENDING_PARENT_CONSENT',
    ).length;

    const hostelStats = hostels.map((h) => {
      const hRooms = rooms.filter((r) => r.hostelId === h.id);
      const hBeds = beds.filter((b) => b.hostelId === h.id);
      const occCount = hBeds.filter((b) => b.status === 'OCCUPIED').length;
      const rate = hBeds.length > 0 ? Math.round((occCount / hBeds.length) * 100) : 0;

      return {
        id: h.id,
        name: h.name,
        code: h.code,
        gender: h.gender,
        warden: h.wardenName,
        wardenPhone: h.wardenPhone,
        rooms: hRooms.length,
        totalBeds: hBeds.length,
        occupiedBeds: occCount,
        vacantBeds: Math.max(0, hBeds.length - occCount),
        occupancyRate: rate,
        status: h.status,
      };
    });

    return {
      totalHalls: totalHostels,
      totalRooms,
      totalCapacity,
      totalOccupied,
      totalVacant,
      occupancyRate,
      genderBreakdown,
      exeatStats: {
        pending: pendingExeats,
        currentlyDeparted: activeDepartedExeats,
        overdue: overdueExeats,
      },
      hostels: hostelStats,
    };
  }

  async getResidentDirectory(
    tenantId: string,
    campusId?: string,
    hostelId?: string,
  ) {
    let allocations = Array.from(this.prisma.memoryStore.hostelAllocations.values()).filter(
      (a) => a.tenantId === tenantId && a.status === 'ACTIVE',
    );
    if (campusId) allocations = allocations.filter((a) => a.campusId === campusId);
    if (hostelId) allocations = allocations.filter((a) => a.hostelId === hostelId);

    const activeExeats = Array.from(this.prisma.memoryStore.hostelExeats.values()).filter(
      (e) => e.tenantId === tenantId && (e.status === 'DEPARTED' || e.status === 'OVERDUE'),
    );
    const exeatMap = new Map(activeExeats.map((e) => [e.studentId, e]));

    return allocations.map((a) => {
      const exeat = exeatMap.get(a.studentId);
      const student = this.prisma.memoryStore.students.get(a.studentId);
      const hostel = this.prisma.memoryStore.hostels.get(a.hostelId);
      const room = this.prisma.memoryStore.hostelRooms.get(a.roomId);
      const bed = this.prisma.memoryStore.hostelBeds.get(a.bedId);

      return {
        allocationId: a.id,
        studentId: a.studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
        admissionNumber: student?.admissionNumber || '',
        gender: student?.gender,
        hostelId: a.hostelId,
        hostelName: hostel?.name || 'Hostel',
        roomId: a.roomId,
        roomNumber: room?.roomNumber || 'Room',
        bedId: a.bedId,
        bedNumber: bed?.bedNumber || 'Bed',
        startDate: a.startDate,
        expectedEndDate: a.expectedEndDate,
        isOnExeat: !!exeat,
        exeatStatus: exeat ? exeat.status : null,
        expectedReturnDate: exeat ? exeat.expectedReturnDate : null,
      };
    });
  }
}
