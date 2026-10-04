import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { HostelSummaryFilterDto } from '../dto/hostel-filter.dto.js';

@Injectable()
export class HostelAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHostelSummary(tenantId: string, filter?: HostelSummaryFilterDto) {
    const campusWhere = filter?.campusId ? { campusId: filter.campusId } : {};

    const [hostels, rooms, beds, exeats] = await Promise.all([
      this.prisma.hostel.findMany({
        where: { tenantId, ...campusWhere },
        include: { rooms: true, beds: true },
      }),
      this.prisma.hostelRoom.findMany({
        where: { tenantId, ...campusWhere },
      }),
      this.prisma.hostelBed.findMany({
        where: { tenantId, ...campusWhere },
      }),
      this.prisma.hostelExeat.findMany({
        where: { tenantId, ...campusWhere },
      }),
    ]);

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
    const where: any = { tenantId, status: 'ACTIVE' };
    if (campusId) where.campusId = campusId;
    if (hostelId) where.hostelId = hostelId;

    const [allocations, activeExeats] = await Promise.all([
      this.prisma.hostelAllocation.findMany({
        where,
        include: {
          student: true,
          hostel: true,
          room: true,
          bed: true,
        },
      }),
      this.prisma.hostelExeat.findMany({
        where: {
          tenantId,
          status: { in: ['DEPARTED', 'OVERDUE'] },
        },
      }),
    ]);

    const exeatMap = new Map(activeExeats.map((e) => [e.studentId, e]));

    return allocations.map((a) => {
      const exeat = exeatMap.get(a.studentId);
      const student = a.student;
      const hostel = a.hostel;
      const room = a.room;
      const bed = a.bed;

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
