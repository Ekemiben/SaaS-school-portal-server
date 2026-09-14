import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { BullmqService } from '../../jobs/bullmq.service.js';
import { QUEUES } from '../../jobs/queue.constants.js';
import { RecordBoardingDto, BoardingStatus } from './dto/fleet-and-trip.dto.js';
import { QueryTransportAttendanceDto } from './dto/transport-attendance.dto.js';
import { TripManagementService } from './trip-management.service.js';

@Injectable()
export class TransportAttendanceService {
  private readonly logger = new Logger(TransportAttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmqService: BullmqService,
    private readonly tripService: TripManagementService,
  ) {}

  async recordCheckIn(tenantId: string, tripId: string, dto: RecordBoardingDto, recordedByUserId?: string) {
    // 1. Record boarding status in Trip Management
    const record = await this.tripService.recordStudentBoarding(tenantId, tripId, {
      ...dto,
      notes: dto.notes ? `${dto.notes} (Recorded by user ${recordedByUserId || 'system'})` : undefined,
    });

    // 2. Fetch trip and student details for parent notifications
    const tripDetails = await this.tripService.getTripDetails(tenantId, tripId);
    let student: any = null;
    let parents: any[] = [];

    if (this.prisma.isDbConnected) {
      student = await this.prisma.student.findFirst({
        where: { id: dto.studentId, tenantId },
        include: {
          parents: {
            include: { parent: true },
          },
        },
      });
      if (student) {
        parents = student.parents.map((sp: any) => sp.parent).filter(Boolean);
      }
    } else {
      student = Array.from(this.prisma.memoryStore.students.values()).find(
        (s) => s.id === dto.studentId && s.tenantId === tenantId,
      );
      // In memory fallback, check parents map
      parents = Array.from(this.prisma.memoryStore.parents.values()).filter((p) => p.tenantId === tenantId);
    }

    // 3. Dispatch Parent Notifications asynchronously via BullMQ if status is BOARDED or DROPPED_OFF
    const notificationResults: any[] = [];
    if (dto.status === BoardingStatus.BOARDED || dto.status === BoardingStatus.DROPPED_OFF) {
      const studentName = student ? `${student.firstName} ${student.lastName}` : 'Your child';
      const stopName = dto.stopName || record.stopName || 'Assigned Stop';
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const routeName = tripDetails.route?.routeName || 'School Bus Route';
      const vehicleNum = tripDetails.vehicleNumber || 'School Bus';

      const isBoarded = dto.status === BoardingStatus.BOARDED;
      const title = isBoarded ? 'School Bus Boarding Confirmation' : 'School Bus Drop-off Confirmation';
      const message = isBoarded
        ? `${studentName} has safely boarded the school bus (${routeName}, ${vehicleNum}) at ${stopName} at ${timeStr}.`
        : `${studentName} has safely been dropped off at ${stopName} at ${timeStr}.`;

      for (const parent of parents) {
        try {
          if (parent.phone) {
            await this.bullmqService.dispatch(
              QUEUES.NOTIFICATIONS,
              'send-transport-sms',
              {
                tenantId,
                data: {
                  channel: 'sms',
                  tenantId,
                  recipient: parent.phone,
                  body: message,
                  metadata: { studentId: dto.studentId, tripId, status: dto.status },
                },
              },
            );
            notificationResults.push({ channel: 'sms', recipient: parent.phone, status: 'QUEUED' });
          }

          if (parent.email) {
            await this.bullmqService.dispatch(
              QUEUES.NOTIFICATIONS,
              'send-transport-email',
              {
                tenantId,
                data: {
                  channel: 'email',
                  tenantId,
                  recipient: parent.email,
                  subject: title,
                  body: message,
                  metadata: { studentId: dto.studentId, tripId, status: dto.status },
                },
              },
            );
            notificationResults.push({ channel: 'email', recipient: parent.email, status: 'QUEUED' });
          }
        } catch (err: any) {
          this.logger.warn(`Failed to queue parent notification for student ${dto.studentId}: ${err?.message}`);
        }
      }
    }

    return {
      success: true,
      checkInRecord: record,
      notificationsQueued: notificationResults.length,
      notifications: notificationResults,
    };
  }

  async batchRecordCheckIn(tenantId: string, tripId: string, dtos: RecordBoardingDto[], recordedByUserId?: string) {
    const results = [];
    for (const dto of dtos) {
      const result = await this.recordCheckIn(tenantId, tripId, dto, recordedByUserId);
      results.push(result);
    }
    return {
      tripId,
      totalProcessed: results.length,
      results,
    };
  }

  async getStudentAttendanceHistory(tenantId: string, studentId: string, query?: QueryTransportAttendanceDto) {
    if (this.prisma.isDbConnected) {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, tenantId },
      });
      if (!student) throw new NotFoundException(`Student "${studentId}" not found in this school organization.`);

      return this.prisma.tripBoardingRecord.findMany({
        where: {
          tenantId,
          studentId,
          ...(query?.startDate && { createdAt: { gte: new Date(query.startDate) } }),
          ...(query?.endDate && { createdAt: { lte: new Date(query.endDate) } }),
        },
        include: {
          trip: {
            include: {
              route: { select: { id: true, routeName: true, fee: true } },
              vehicle: { select: { id: true, vehicleNumber: true, model: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
      });
    }

    const student = Array.from(this.prisma.memoryStore.students.values()).find(
      (s) => s.id === studentId && s.tenantId === tenantId,
    );
    if (!student) throw new NotFoundException('Student not found in this school organization.');

    const records = Array.from(this.prisma.memoryStore.tripBoardingRecords.values()).filter(
      (r) => r.studentId === studentId && r.tenantId === tenantId,
    );

    return records.slice(0, query?.limit || 50);
  }

  async getTripAttendanceRoster(tenantId: string, tripId: string) {
    return this.tripService.getTripDetails(tenantId, tripId);
  }
}
