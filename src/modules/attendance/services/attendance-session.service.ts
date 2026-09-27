import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomBytes, randomUUID } from 'crypto';
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
    let targetClass: any = null;
    if (this.prisma.isDbConnected) {
      targetClass = await this.prisma.class.findFirst({
        where: {
          tenantId,
          OR: [{ id: dto.classId }, { name: dto.classId }],
        },
      });
    }
    if (!targetClass) {
      targetClass = this.prisma.memoryStore.classes.get(dto.classId) ||
        Array.from(this.prisma.memoryStore.classes.values()).find(
          (c: any) => c.tenantId === tenantId && (c.id === dto.classId || c.name === dto.classId),
        );
    }
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Class ${dto.classId} not found in this school.`);
    }

    if (dto.subjectId) {
      let subject: any = null;
      if (this.prisma.isDbConnected) {
        subject = await this.prisma.subject.findFirst({
          where: { tenantId, id: dto.subjectId },
        });
      }
      if (!subject) {
        subject = this.prisma.memoryStore.subjects.get(dto.subjectId);
      }
      if (!subject || subject.tenantId !== tenantId) {
        throw new NotFoundException(`Subject ${dto.subjectId} not found in this school.`);
      }
    }

    if (this.prisma.isDbConnected) {
      try {
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
        return session;
      } catch (err: any) {
        this.logger.warn(`PostgreSQL createSession failed: ${err.message}, falling back to memory store`);
      }
    }

    const sessionId = `att_sess_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const session = {
      id: sessionId,
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
      qrToken: null,
      qrExpiresAt: null,
      markedByUserId: actorUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.attendanceSessions.set(sessionId, session);
    this.logger.log(`Created attendance session ${sessionId} (${dto.title}) for class ${dto.classId}`);
    return session;
  }

  async generateQrToken(
    tenantId: string,
    sessionId: string,
    _actorUserId: string,
    dto?: GenerateQrTokenDto,
  ) {
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof BadRequestException) throw err;
        this.logger.warn(`PostgreSQL generateQrToken failed: ${err.message}, falling back to memory store`);
      }
    }

    const session = this.prisma.memoryStore.attendanceSessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
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

    session.qrToken = qrToken;
    session.qrExpiresAt = qrExpiresAt;
    session.updatedAt = new Date();
    this.prisma.memoryStore.attendanceSessions.set(sessionId, session);

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
    if (this.prisma.isDbConnected) {
      try {
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
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`PostgreSQL closeSession failed: ${err.message}, falling back to memory store`);
      }
    }

    const session = this.prisma.memoryStore.attendanceSessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException(`Attendance session ${sessionId} not found.`);
    }

    session.status = 'CLOSED';
    session.endTime = new Date();
    session.qrToken = null;
    session.qrExpiresAt = null;
    session.updatedAt = new Date();
    this.prisma.memoryStore.attendanceSessions.set(sessionId, session);

    return session;
  }

  async getSessionById(tenantId: string, sessionId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const session = await this.prisma.attendanceSession.findFirst({
          where: { id: sessionId, tenantId },
        });
        if (!session) {
          throw new NotFoundException(`Attendance session ${sessionId} not found.`);
        }
        return session;
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`PostgreSQL getSessionById failed: ${err.message}, falling back to memory store`);
      }
    }

    const session = this.prisma.memoryStore.attendanceSessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      throw new NotFoundException(`Attendance session ${sessionId} not found.`);
    }
    return session;
  }
}
