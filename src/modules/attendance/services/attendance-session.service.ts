import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomBytes } from 'crypto';
import { CreateAttendanceSessionDto, GenerateQrTokenDto, QrCheckInDto } from '../dto/attendance-session.dto.js';
import { AttendanceConfigService } from './attendance-config.service.js';
import { DeviceAdapterRegistryService } from '../devices/device-adapter-registry.service.js';

@Injectable()
export class AttendanceSessionService {
  private readonly logger = new Logger(AttendanceSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: AttendanceConfigService,
    private readonly deviceRegistry: DeviceAdapterRegistryService,
  ) {}

  async createSession(
    tenantId: string,
    campusId: string,
    actorUserId: string,
    dto: CreateAttendanceSessionDto,
  ) {
    const targetClass = await this.prisma.class.findFirst({
      where: {
        tenantId,
        OR: [{ id: dto.classId }, { name: dto.classId }],
      },
    });

    if (!targetClass) {
      throw new NotFoundException(`Class ${dto.classId} not found in this school.`);
    }

    if (dto.subjectId) {
      const subject = await this.prisma.subject.findFirst({
        where: { tenantId, id: dto.subjectId },
      });

      if (!subject) {
        throw new NotFoundException(`Subject ${dto.subjectId} not found in this school.`);
      }
    }

    const session = await this.prisma.attendanceSession.create({
      data: {
        tenantId,
        campusId: dto.campusId || campusId || targetClass.campusId,
        classId: targetClass.id,
        subjectId: dto.subjectId || null,
        academicYearId: dto.academicYearId || null,
        termId: dto.termId || null,
        sessionType: dto.sessionType || (dto.subjectId ? 'SUBJECT_PERIOD' : 'DAILY'),
        title: dto.title,
        date: new Date(dto.date),
        periodNumber: dto.periodNumber || null,
        startTime: dto.startTime ? new Date(dto.startTime) : new Date(),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        status: 'OPEN',
        markedByUserId: actorUserId,
      },
    });

    this.logger.log(`Created attendance session ${session.id} (${dto.title}) for class ${dto.classId}`);
    return session;
  }

  async generateQrToken(
    tenantId: string,
    sessionId: string,
    _actorUserId: string,
    dto?: GenerateQrTokenDto,
  ) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException(`Attendance session ${sessionId} not found.`);
    }

    if (session.status !== 'OPEN') {
      throw new BadRequestException(`Cannot generate QR token for a ${session.status} session.`);
    }

    const config = await this.configService.getConfig(tenantId);
    if (!config.qrEnabled) {
      throw new BadRequestException('QR attendance is disabled in school settings. Enable QR attendance first.');
    }

    const expirySeconds = dto?.expirySeconds || config.qrTokenExpirySeconds || 60;
    const qrToken = `qr_${randomBytes(16).toString('hex')}`;
    const qrExpiresAt = new Date(Date.now() + expirySeconds * 1000);

    await this.prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { qrToken, qrExpiresAt },
    });

    return {
      sessionId: session.id,
      qrToken,
      expiresAt: qrExpiresAt,
      expirySeconds,
      title: session.title,
    };
  }

  async processQrCheckIn(
    tenantId: string,
    actorUserId: string,
    dto: QrCheckInDto,
  ) {
    return this.deviceRegistry.processCheckIn(tenantId, 'QR', actorUserId, {
      sessionId: dto.sessionId,
      identifier: dto.qrToken,
      studentId: dto.studentId,
      remarks: dto.remarks,
    });
  }

  async closeSession(
    tenantId: string,
    sessionId: string,
    _actorUserId: string,
  ) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException(`Attendance session ${sessionId} not found.`);
    }

    const updated = await this.prisma.attendanceSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        endTime: new Date(),
        qrToken: null,
        qrExpiresAt: null,
      },
    });

    return updated;
  }

  async getSessionById(tenantId: string, sessionId: string) {
    const session = await this.prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException(`Attendance session ${sessionId} not found.`);
    }
    return session;
  }
}
