import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTimetableDto, CreateTimetableEntryDto } from './dto/create-timetable.dto.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';

const DAY_STRING_TO_INT: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const INT_TO_DAY_STRING: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const PERIOD_TIMES: Record<number, { startTime: string; endTime: string }> = {
  1: { startTime: '08:00', endTime: '08:45' },
  2: { startTime: '08:45', endTime: '09:30' },
  3: { startTime: '09:30', endTime: '10:15' },
  4: { startTime: '10:45', endTime: '11:30' },
  5: { startTime: '11:30', endTime: '12:15' },
  6: { startTime: '12:15', endTime: '13:00' },
  7: { startTime: '13:45', endTime: '14:30' },
  8: { startTime: '14:30', endTime: '15:15' },
};

function normalizeDayOfWeek(day: string | number): number {
  if (typeof day === 'number') return day;
  const lower = String(day).toLowerCase().trim();
  return DAY_STRING_TO_INT[lower] || 1;
}

@Injectable()
export class TimetableService {
  private readonly logger = new Logger(TimetableService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTimetable(tenantId: string, dto: CreateTimetableDto) {
    const id = `tt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timetableData = {
      id,
      tenantId,
      campusId: dto.campusId || 'campus_main_01',
      classId: dto.classId,
      academicYearId: dto.academicYearId,
      termId: dto.termId || null,
      name: dto.name || 'Class Timetable',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        const created = await this.prisma.timetable.create({
          data: {
            id,
            tenantId,
            campusId: dto.campusId || 'campus_main_01',
            classId: dto.classId,
            academicYearId: dto.academicYearId,
            termId: dto.termId || null,
            name: dto.name || 'Class Timetable',
          },
        });
        this.prisma.memoryStore.timetables.set(id, created);
        return created;
      } catch (err: any) {
        this.logger.warn(`Could not persist timetable to DB directly: ${err.message}`);
      }
    }

    this.prisma.memoryStore.timetables.set(id, timetableData);
    return timetableData;
  }

  async getTimetableByClass(tenantId: string, classId: string, termId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        const timetable = await this.prisma.timetable.findFirst({
          where: {
            tenantId,
            classId,
            ...(termId ? { termId } : {}),
          },
          include: {
            entries: {
              include: {
                subject: true,
                teacher: true,
              },
              orderBy: { startTime: 'asc' },
            },
          },
        });

        if (timetable) {
          const entries = timetable.entries.map((entry) => ({
            ...entry,
            day: INT_TO_DAY_STRING[entry.dayOfWeek] || 'Monday',
            subjectName: entry.subject?.name || 'Subject',
            teacherName: entry.teacher
              ? `${entry.teacher.firstName} ${entry.teacher.lastName}`.trim()
              : 'Teacher',
          }));
          return { timetable, entries };
        }
      } catch (err: any) {
        this.logger.warn(`Could not query timetable from DB: ${err.message}`);
      }
    }

    const timetables = Array.from(this.prisma.memoryStore.timetables.values()).filter(
      (t) => t.tenantId === tenantId && t.classId === classId && (!termId || t.termId === termId),
    );

    const timetable = timetables[0];
    if (!timetable) {
      return { timetable: null, entries: [] };
    }

    const entries = Array.from(this.prisma.memoryStore.timetableEntries.values())
      .filter((e) => e.tenantId === tenantId && e.timetableId === timetable.id)
      .map((entry) => {
        const subject = this.prisma.memoryStore.subjects.get(entry.subjectId) || { name: 'Subject' };
        const teacher = this.prisma.memoryStore.teachers.get(entry.teacherId) || { firstName: 'Teacher', lastName: '' };
        return {
          ...entry,
          day: typeof entry.dayOfWeek === 'number' ? (INT_TO_DAY_STRING[entry.dayOfWeek] || 'Monday') : (entry.day || 'Monday'),
          subjectName: subject.name,
          teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return { timetable, entries };
  }

  async getTeacherSchedule(tenantId: string, teacherId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const entries = await this.prisma.timetableEntry.findMany({
          where: {
            teacherId,
            timetable: { tenantId },
          },
          include: {
            timetable: { include: { class: true } },
            subject: true,
          },
          orderBy: { startTime: 'asc' },
        });

        if (entries.length > 0) {
          return entries.map((e) => ({
            ...e,
            day: INT_TO_DAY_STRING[e.dayOfWeek] || 'Monday',
            className: e.timetable?.class?.name || 'Class',
            subjectName: e.subject?.name || 'Subject',
          }));
        }
      } catch (err: any) {
        this.logger.warn(`Could not query teacher schedule from DB: ${err.message}`);
      }
    }

    const entries = Array.from(this.prisma.memoryStore.timetableEntries.values())
      .filter((e) => e.tenantId === tenantId && e.teacherId === teacherId)
      .map((entry) => {
        const timetable = this.prisma.memoryStore.timetables.get(entry.timetableId);
        const cls = timetable ? this.prisma.memoryStore.classes.get(timetable.classId) : null;
        const subject = this.prisma.memoryStore.subjects.get(entry.subjectId);
        return {
          ...entry,
          day: typeof entry.dayOfWeek === 'number' ? (INT_TO_DAY_STRING[entry.dayOfWeek] || 'Monday') : (entry.day || 'Monday'),
          className: cls?.name || 'Class',
          subjectName: subject?.name || 'Subject',
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return entries;
  }

  async getAllEntries(
    tenantId: string,
    filters: { campusId?: string; classId?: string; teacherId?: string } = {},
  ) {
    if (this.prisma.isDbConnected) {
      try {
        const entries = await this.prisma.timetableEntry.findMany({
          where: {
            timetable: {
              tenantId,
              ...(filters.campusId ? { campusId: filters.campusId } : {}),
              ...(filters.classId ? { classId: filters.classId } : {}),
            },
            ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
          },
          include: {
            timetable: { include: { class: true } },
            subject: true,
            teacher: true,
          },
          orderBy: { startTime: 'asc' },
        });

        if (entries.length > 0) {
          return entries.map((e) => ({
            id: e.id,
            timetableId: e.timetableId,
            dayOfWeek: e.dayOfWeek,
            day: INT_TO_DAY_STRING[e.dayOfWeek] || 'Monday',
            startTime: e.startTime,
            endTime: e.endTime,
            subjectId: e.subjectId,
            subject: e.subject?.name || 'Subject',
            subjectName: e.subject?.name || 'Subject',
            teacherId: e.teacherId,
            teacher: e.teacher ? `${e.teacher.firstName} ${e.teacher.lastName}`.trim() : 'Teacher',
            teacherName: e.teacher ? `${e.teacher.firstName} ${e.teacher.lastName}`.trim() : 'Teacher',
            room: e.room,
            classroom: e.room,
            classId: e.timetable?.classId,
            classLevel: e.timetable?.class?.name || 'Class',
          }));
        }
      } catch (err: any) {
        this.logger.warn(`Could not query all timetable entries from DB: ${err.message}`);
      }
    }

    let entries = Array.from(this.prisma.memoryStore.timetableEntries.values()).filter(
      (e: any) => e.tenantId === tenantId,
    );
    if (filters.campusId) {
      entries = entries.filter((e: any) => !e.campusId || e.campusId === filters.campusId);
    }
    if (filters.classId) {
      entries = entries.filter((e: any) => e.classId === filters.classId || e.classLevel === filters.classId);
    }
    if (filters.teacherId) {
      entries = entries.filter((e: any) => e.teacherId === filters.teacherId || e.teacher === filters.teacherId);
    }
    return entries.map((e: any) => ({
      ...e,
      day: typeof e.dayOfWeek === 'number' ? (INT_TO_DAY_STRING[e.dayOfWeek] || 'Monday') : (e.day || 'Monday'),
    }));
  }

  async addEntry(tenantId: string, dto: any) {
    const dayOfWeek = normalizeDayOfWeek(dto.dayOfWeek || dto.day || 1);
    let startTime = dto.startTime;
    let endTime = dto.endTime;

    if ((!startTime || !endTime) && dto.periodId && PERIOD_TIMES[dto.periodId]) {
      startTime = PERIOD_TIMES[dto.periodId].startTime;
      endTime = PERIOD_TIMES[dto.periodId].endTime;
    }

    // Conflict detection: Check if teacher or classroom is already scheduled during this day & overlapping time
    if (startTime && endTime) {
      const existingEntries = Array.from(this.prisma.memoryStore.timetableEntries.values()).filter(
        (e: any) => e.tenantId === tenantId && normalizeDayOfWeek(e.dayOfWeek || e.day) === dayOfWeek,
      );

      for (const existing of existingEntries) {
        const existStart = existing.startTime || (PERIOD_TIMES[existing.periodId]?.startTime);
        const existEnd = existing.endTime || (PERIOD_TIMES[existing.periodId]?.endTime);

        if (existStart && existEnd) {
          const isTimeOverlap = startTime < existEnd && endTime > existStart;

          if (isTimeOverlap) {
            const sameTeacher =
              (dto.teacherId && existing.teacherId === dto.teacherId) ||
              (dto.teacher && existing.teacher && dto.teacher === existing.teacher);

            if (sameTeacher) {
              throw new ConflictException({
                errorCode: ErrorCodes.CONFLICT,
                message: `Teacher is already booked for another period on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
              });
            }

            const roomA = dto.room || dto.classroom;
            const roomB = existing.room || existing.classroom;
            if (roomA && roomB && roomA.toLowerCase() === roomB.toLowerCase()) {
              throw new ConflictException({
                errorCode: ErrorCodes.CONFLICT,
                message: `Classroom ${roomA} is already occupied on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
              });
            }
          }
        }
      }
    }

    const id = dto.id || `tte_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entry = {
      ...dto,
      id,
      tenantId,
      dayOfWeek,
      day: INT_TO_DAY_STRING[dayOfWeek],
      startTime: startTime || '08:00',
      endTime: endTime || '08:45',
      room: dto.room || dto.classroom || null,
      classroom: dto.room || dto.classroom || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && dto.timetableId && dto.subjectId) {
      try {
        await this.prisma.timetableEntry.create({
          data: {
            id,
            timetableId: dto.timetableId,
            dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            subjectId: dto.subjectId,
            teacherId: dto.teacherId || null,
            room: entry.room,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not persist timetable entry to DB directly: ${err.message}`);
      }
    }

    this.prisma.memoryStore.timetableEntries.set(id, entry);
    return entry;
  }

  async updateEntry(tenantId: string, entryId: string, data: any) {
    const entry = this.prisma.memoryStore.timetableEntries.get(entryId);
    if (!entry || entry.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Timetable entry not found',
      });
    }

    if (data.day || data.dayOfWeek) {
      data.dayOfWeek = normalizeDayOfWeek(data.dayOfWeek || data.day);
      data.day = INT_TO_DAY_STRING[data.dayOfWeek];
    }
    if (data.room || data.classroom) {
      data.room = data.room || data.classroom;
      data.classroom = data.room;
    }

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.timetableEntry.update({
          where: { id: entryId },
          data: {
            ...(data.dayOfWeek ? { dayOfWeek: data.dayOfWeek } : {}),
            ...(data.startTime ? { startTime: data.startTime } : {}),
            ...(data.endTime ? { endTime: data.endTime } : {}),
            ...(data.room ? { room: data.room } : {}),
            ...(data.subjectId ? { subjectId: data.subjectId } : {}),
            ...(data.teacherId ? { teacherId: data.teacherId } : {}),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update timetable entry in DB: ${err.message}`);
      }
    }

    Object.assign(entry, data, { updatedAt: new Date() });
    this.prisma.memoryStore.timetableEntries.set(entryId, entry);
    return entry;
  }

  async deleteEntry(tenantId: string, entryId: string) {
    const entry = this.prisma.memoryStore.timetableEntries.get(entryId);
    if (!entry || entry.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Timetable entry not found',
      });
    }

    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.timetableEntry.delete({ where: { id: entryId } });
      } catch (err: any) {
        this.logger.warn(`Could not delete timetable entry from DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.timetableEntries.delete(entryId);
    return { success: true, message: 'Timetable entry removed successfully' };
  }
}
