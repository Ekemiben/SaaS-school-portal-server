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

  /**
   * Conflict Detection Engine across Educator double-booking, Room collision, and Class scheduling clashes.
   */
  private async validateScheduleConflict(
    tenantId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    options: {
      excludeEntryId?: string;
      teacherId?: string;
      teacherName?: string;
      room?: string;
      classId?: string;
      className?: string;
    },
  ) {
    if (!startTime || !endTime) return;

    // 1. Check PostgreSQL DB if connected
    if (this.prisma.isDbConnected) {
      try {
        const dbEntries = await this.prisma.timetableEntry.findMany({
          where: {
            timetable: { tenantId },
            dayOfWeek,
            ...(options.excludeEntryId ? { id: { not: options.excludeEntryId } } : {}),
          },
          include: {
            timetable: { include: { class: true } },
            teacher: true,
            subject: true,
          },
        });

        for (const existing of dbEntries) {
          const existStart = existing.startTime;
          const existEnd = existing.endTime;
          if (existStart && existEnd) {
            const isOverlap = startTime < existEnd && endTime > existStart;
            if (isOverlap) {
              // Teacher double-booking check
              const existTeacherName = existing.teacher
                ? `${existing.teacher.firstName} ${existing.teacher.lastName}`.trim().toLowerCase()
                : '';
              const incomingTeacherName = (options.teacherName || '').trim().toLowerCase();
              if (
                (options.teacherId && existing.teacherId === options.teacherId) ||
                (incomingTeacherName && existTeacherName && incomingTeacherName === existTeacherName)
              ) {
                throw new ConflictException({
                  errorCode: ErrorCodes.CONFLICT,
                  message: `Teacher ${options.teacherName || 'selected'} is already booked for another period on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
                });
              }

              // Classroom / Facility collision check
              const roomA = (options.room || '').trim().toLowerCase();
              const roomB = (existing.room || '').trim().toLowerCase();
              if (roomA && roomB && roomA === roomB) {
                throw new ConflictException({
                  errorCode: ErrorCodes.CONFLICT,
                  message: `Classroom/Facility "${options.room}" is already occupied on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
                });
              }

              // Class collision check
              const clsA = (options.classId || '').trim();
              const clsB = (existing.timetable?.classId || '').trim();
              const clsNameA = (options.className || '').trim().toLowerCase();
              const clsNameB = (existing.timetable?.class?.name || '').trim().toLowerCase();
              if (
                (clsA && clsB && clsA === clsB) ||
                (clsNameA && clsNameB && clsNameA === clsNameB)
              ) {
                throw new ConflictException({
                  errorCode: ErrorCodes.CONFLICT,
                  message: `Class "${options.className || 'selected'}" already has another lesson scheduled on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
                });
              }
            }
          }
        }
      } catch (err: any) {
        if (err instanceof ConflictException) throw err;
        this.logger.warn(`Could not verify DB timetable conflicts: ${err.message}`);
      }
    }

    // 2. Check In-Memory Store
    const memEntries = Array.from(this.prisma.memoryStore.timetableEntries.values()).filter(
      (e: any) =>
        e.tenantId === tenantId &&
        normalizeDayOfWeek(e.dayOfWeek || e.day) === dayOfWeek &&
        (!options.excludeEntryId || e.id !== options.excludeEntryId),
    );

    for (const existing of memEntries) {
      const existStart = existing.startTime || PERIOD_TIMES[existing.periodId]?.startTime;
      const existEnd = existing.endTime || PERIOD_TIMES[existing.periodId]?.endTime;

      if (existStart && existEnd) {
        const isOverlap = startTime < existEnd && endTime > existStart;
        if (isOverlap) {
          const sameTeacher =
            (options.teacherId && existing.teacherId === options.teacherId) ||
            (options.teacherName &&
              existing.teacher &&
              options.teacherName.toLowerCase() === existing.teacher.toLowerCase()) ||
            (options.teacherName &&
              existing.teacherName &&
              options.teacherName.toLowerCase() === existing.teacherName.toLowerCase());

          if (sameTeacher) {
            throw new ConflictException({
              errorCode: ErrorCodes.CONFLICT,
              message: `Teacher is already booked for another period on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
            });
          }

          const roomA = (options.room || '').trim().toLowerCase();
          const roomB = (existing.room || existing.classroom || '').trim().toLowerCase();
          if (roomA && roomB && roomA === roomB) {
            throw new ConflictException({
              errorCode: ErrorCodes.CONFLICT,
              message: `Classroom ${options.room} is already occupied on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
            });
          }

          const clsA = (options.classId || '').trim();
          const clsB = (existing.classId || '').trim();
          const clsNameA = (options.className || '').trim().toLowerCase();
          const clsNameB = (existing.classLevel || existing.className || '').trim().toLowerCase();
          if (
            (clsA && clsB && clsA === clsB) ||
            (clsNameA && clsNameB && clsNameA === clsNameB)
          ) {
            throw new ConflictException({
              errorCode: ErrorCodes.CONFLICT,
              message: `Class is already scheduled for another period on ${INT_TO_DAY_STRING[dayOfWeek]} between ${existStart} and ${existEnd}`,
            });
          }
        }
      }
    }
  }

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
        await this.prisma.auditLog.create({
          data: {
            tenantId,
            action: 'TIMETABLE_CREATED',
            resourceType: 'Timetable',
            resourceId: id,
            afterData: {
              classId: dto.classId,
              academicYearId: dto.academicYearId,
              termId: dto.termId,
              name: dto.name,
            } as any,
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
        const teacher = this.prisma.memoryStore.teachers.get(entry.teacherId) || {
          firstName: 'Teacher',
          lastName: '',
        };
        return {
          ...entry,
          day:
            typeof entry.dayOfWeek === 'number'
              ? INT_TO_DAY_STRING[entry.dayOfWeek] || 'Monday'
              : entry.day || 'Monday',
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
          day:
            typeof entry.dayOfWeek === 'number'
              ? INT_TO_DAY_STRING[entry.dayOfWeek] || 'Monday'
              : entry.day || 'Monday',
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
          return entries.map((e) => {
            const periodNum = Object.entries(PERIOD_TIMES).find(
              ([_, t]) => t.startTime === e.startTime,
            )?.[0];
            return {
              id: e.id,
              timetableId: e.timetableId,
              dayOfWeek: e.dayOfWeek,
              day: INT_TO_DAY_STRING[e.dayOfWeek] || 'Monday',
              startTime: e.startTime,
              endTime: e.endTime,
              periodId: periodNum ? Number(periodNum) : 1,
              subjectId: e.subjectId,
              subject: e.subject?.name || 'Subject',
              subjectName: e.subject?.name || 'Subject',
              teacherId: e.teacherId,
              teacher: e.teacher
                ? `${e.teacher.firstName} ${e.teacher.lastName}`.trim()
                : 'Teacher',
              teacherName: e.teacher
                ? `${e.teacher.firstName} ${e.teacher.lastName}`.trim()
                : 'Teacher',
              room: e.room,
              classroom: e.room,
              classId: e.timetable?.classId,
              classLevel: e.timetable?.class?.name || 'Class',
            };
          });
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
      entries = entries.filter(
        (e: any) => e.classId === filters.classId || e.classLevel === filters.classId,
      );
    }
    if (filters.teacherId) {
      entries = entries.filter(
        (e: any) => e.teacherId === filters.teacherId || e.teacher === filters.teacherId,
      );
    }
    return entries.map((e: any) => ({
      ...e,
      day:
        typeof e.dayOfWeek === 'number'
          ? INT_TO_DAY_STRING[e.dayOfWeek] || 'Monday'
          : e.day || 'Monday',
      periodId: Number(e.periodId || 1),
    }));
  }

  async addEntry(tenantId: string, dto: any) {
    const dayOfWeek = normalizeDayOfWeek(dto.dayOfWeek || dto.day || 1);
    const periodId = dto.periodId ? Number(dto.periodId) : 1;
    let startTime = dto.startTime;
    let endTime = dto.endTime;

    if ((!startTime || !endTime) && periodId && PERIOD_TIMES[periodId]) {
      startTime = PERIOD_TIMES[periodId].startTime;
      endTime = PERIOD_TIMES[periodId].endTime;
    }

    // Comprehensive conflict check
    await this.validateScheduleConflict(tenantId, dayOfWeek, startTime || '08:00', endTime || '08:45', {
      teacherId: dto.teacherId,
      teacherName: dto.teacher || dto.teacherName,
      room: dto.room || dto.classroom,
      classId: dto.classId,
      className: dto.classLevel || dto.className,
    });

    const id = dto.id || `tte_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entry = {
      ...dto,
      id,
      tenantId,
      dayOfWeek,
      day: INT_TO_DAY_STRING[dayOfWeek],
      periodId,
      startTime: startTime || '08:00',
      endTime: endTime || '08:45',
      subject: dto.subject || dto.subjectName || 'Subject',
      teacher: dto.teacher || dto.teacherName || 'Teacher',
      classLevel: dto.classLevel || dto.className || 'Class',
      room: dto.room || dto.classroom || 'Room 101 (Block A)',
      classroom: dto.room || dto.classroom || 'Room 101 (Block A)',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected) {
      try {
        let timetableId = dto.timetableId;
        let cls: any = null;
        if (!timetableId) {
          cls = await this.prisma.class.findFirst({
            where: {
              tenantId,
              OR: [
                { id: dto.classId || dto.classLevel },
                { name: { equals: dto.classLevel || dto.className || '', mode: 'insensitive' } },
                { name: { contains: dto.classLevel || dto.className || '', mode: 'insensitive' } },
              ],
            },
          });

          if (!cls) {
            const academicYear =
              (await this.prisma.academicYear.findFirst({ where: { tenantId, isCurrent: true } })) ||
              (await this.prisma.academicYear.findFirst({ where: { tenantId } }));
            const mainCampus = await this.prisma.campus.findFirst({ where: { tenantId } });

            if (academicYear && mainCampus) {
              cls = await this.prisma.class.create({
                data: {
                  id: `cls_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  tenantId,
                  campusId: mainCampus.id,
                  academicYearId: academicYear.id,
                  name: dto.classLevel || dto.className || 'Class 1',
                  gradeLevel: dto.classLevel || dto.className || 'Class 1',
                },
              });
            }
          }

          if (cls) {
            let tt = await this.prisma.timetable.findFirst({
              where: { tenantId, classId: cls.id },
            });
            if (!tt) {
              tt = await this.prisma.timetable.create({
                data: {
                  id: `tt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  tenantId,
                  campusId: cls.campusId,
                  classId: cls.id,
                  academicYearId: cls.academicYearId,
                  name: `${cls.name} Timetable`,
                },
              });
            }
            timetableId = tt.id;
          }
        }

        let subjectId = dto.subjectId;
        if (!subjectId && (dto.subject || dto.subjectName)) {
          let sub = await this.prisma.subject.findFirst({
            where: {
              tenantId,
              OR: [
                { id: dto.subject },
                { name: { equals: dto.subject || dto.subjectName, mode: 'insensitive' } },
                { code: { equals: dto.subject || dto.subjectName, mode: 'insensitive' } },
              ],
            },
          });
          if (!sub) {
            sub = await this.prisma.subject.create({
              data: {
                id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                tenantId,
                name: dto.subject || dto.subjectName,
                code: (dto.subject || dto.subjectName).substring(0, 4).toUpperCase(),
              },
            });
          }
          subjectId = sub.id;
        }

        let teacherId = dto.teacherId;
        if (!teacherId && (dto.teacher || dto.teacherName)) {
          const teacherNameFirst = (dto.teacher || dto.teacherName).split(' ')[0];
          const tch = await this.prisma.teacher.findFirst({
            where: {
              tenantId,
              OR: [
                { id: dto.teacher },
                { firstName: { contains: teacherNameFirst, mode: 'insensitive' } },
                { lastName: { contains: teacherNameFirst, mode: 'insensitive' } },
              ],
            },
          });
          if (tch) teacherId = tch.id;
        }

        if (timetableId && subjectId) {
          await this.prisma.timetableEntry.create({
            data: {
              id,
              timetableId,
              dayOfWeek,
              startTime: entry.startTime,
              endTime: entry.endTime,
              subjectId,
              teacherId: teacherId || null,
              room: entry.room,
            },
          });

          await this.prisma.auditLog.create({
            data: {
              tenantId,
              action: 'TIMETABLE_SLOT_ASSIGNED',
              resourceType: 'TimetableEntry',
              resourceId: id,
              afterData: {
                timetableId,
                classId: cls?.id || dto.classId,
                className: cls?.name || dto.classLevel,
                day: INT_TO_DAY_STRING[dayOfWeek],
                periodId,
                startTime: entry.startTime,
                endTime: entry.endTime,
                subject: entry.subject,
                teacher: entry.teacher,
                room: entry.room,
              } as any,
            },
          });
        }
      } catch (err: any) {
        if (err instanceof ConflictException) throw err;
        this.logger.warn(`Could not persist timetable entry to DB directly: ${err.message}`);
      }
    }

    this.prisma.memoryStore.timetableEntries.set(id, entry);
    return entry;
  }

  async updateEntry(tenantId: string, entryId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        const dbEntry = await this.prisma.timetableEntry.findFirst({
          where: { id: entryId, timetable: { tenantId } },
          include: { timetable: { include: { class: true } }, subject: true, teacher: true },
        });

        if (dbEntry) {
          const dayNum =
            data.day || data.dayOfWeek
              ? normalizeDayOfWeek(data.dayOfWeek || data.day)
              : dbEntry.dayOfWeek;
          let startTime = data.startTime || dbEntry.startTime;
          let endTime = data.endTime || dbEntry.endTime;
          const periodId = data.periodId ? Number(data.periodId) : undefined;
          if (periodId && PERIOD_TIMES[periodId]) {
            startTime = PERIOD_TIMES[periodId].startTime;
            endTime = PERIOD_TIMES[periodId].endTime;
          }

          // Conflict detection on update
          await this.validateScheduleConflict(tenantId, dayNum, startTime, endTime, {
            excludeEntryId: entryId,
            teacherId: data.teacherId || dbEntry.teacherId || undefined,
            teacherName: data.teacher || data.teacherName,
            room: data.room || data.classroom || dbEntry.room,
            classId: dbEntry.timetable?.classId,
            className: dbEntry.timetable?.class?.name || data.classLevel,
          });

          const updated = await this.prisma.timetableEntry.update({
            where: { id: entryId },
            data: {
              dayOfWeek: dayNum,
              ...(startTime ? { startTime } : {}),
              ...(endTime ? { endTime } : {}),
              ...(data.room || data.classroom ? { room: data.room || data.classroom } : {}),
              ...(data.subjectId ? { subjectId: data.subjectId } : {}),
              ...(data.teacherId ? { teacherId: data.teacherId } : {}),
            },
            include: { timetable: { include: { class: true } }, subject: true, teacher: true },
          });

          await this.prisma.auditLog.create({
            data: {
              tenantId,
              action: 'TIMETABLE_SLOT_UPDATED',
              resourceType: 'TimetableEntry',
              resourceId: entryId,
              afterData: {
                day: INT_TO_DAY_STRING[updated.dayOfWeek],
                startTime: updated.startTime,
                endTime: updated.endTime,
                room: updated.room,
                subjectId: updated.subjectId,
                teacherId: updated.teacherId,
              } as any,
            },
          });

          const periodNum = Object.entries(PERIOD_TIMES).find(
            ([_, t]) => t.startTime === updated.startTime,
          )?.[0];

          const mapped = {
            id: updated.id,
            timetableId: updated.timetableId,
            dayOfWeek: updated.dayOfWeek,
            day: INT_TO_DAY_STRING[updated.dayOfWeek] || 'Monday',
            startTime: updated.startTime,
            endTime: updated.endTime,
            periodId: periodNum ? Number(periodNum) : (periodId || 1),
            subjectId: updated.subjectId,
            subject: updated.subject?.name || data.subject || 'Subject',
            subjectName: updated.subject?.name || data.subject || 'Subject',
            teacherId: updated.teacherId,
            teacher: updated.teacher
              ? `${updated.teacher.firstName} ${updated.teacher.lastName}`.trim()
              : data.teacher || 'Teacher',
            teacherName: updated.teacher
              ? `${updated.teacher.firstName} ${updated.teacher.lastName}`.trim()
              : data.teacher || 'Teacher',
            room: updated.room,
            classroom: updated.room,
            classId: updated.timetable?.classId,
            classLevel: updated.timetable?.class?.name || data.classLevel || 'Class',
          };
          this.prisma.memoryStore.timetableEntries.set(entryId, mapped);
          return mapped;
        }
      } catch (err: any) {
        if (err instanceof ConflictException) throw err;
        this.logger.warn(`Could not update timetable entry in DB: ${err.message}`);
      }
    }

    const entry = this.prisma.memoryStore.timetableEntries.get(entryId);
    if (!entry || entry.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Timetable entry not found',
      });
    }

    const dayOfWeek =
      data.day || data.dayOfWeek
        ? normalizeDayOfWeek(data.dayOfWeek || data.day)
        : entry.dayOfWeek;
    let startTime = data.startTime || entry.startTime;
    let endTime = data.endTime || entry.endTime;
    if (data.periodId && PERIOD_TIMES[Number(data.periodId)]) {
      startTime = PERIOD_TIMES[Number(data.periodId)].startTime;
      endTime = PERIOD_TIMES[Number(data.periodId)].endTime;
    }

    await this.validateScheduleConflict(tenantId, dayOfWeek, startTime, endTime, {
      excludeEntryId: entryId,
      teacherId: data.teacherId || entry.teacherId,
      teacherName: data.teacher || data.teacherName || entry.teacher || entry.teacherName,
      room: data.room || data.classroom || entry.room,
      classId: entry.classId,
      className: entry.classLevel || entry.className,
    });

    if (data.day || data.dayOfWeek) {
      data.dayOfWeek = dayOfWeek;
      data.day = INT_TO_DAY_STRING[data.dayOfWeek];
    }
    if (data.room || data.classroom) {
      data.room = data.room || data.classroom;
      data.classroom = data.room;
    }
    if (data.periodId) {
      data.periodId = Number(data.periodId);
      data.startTime = startTime;
      data.endTime = endTime;
    }

    Object.assign(entry, data, { updatedAt: new Date() });
    this.prisma.memoryStore.timetableEntries.set(entryId, entry);
    return entry;
  }

  async deleteEntry(tenantId: string, entryId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const dbEntry = await this.prisma.timetableEntry.findFirst({
          where: { id: entryId, timetable: { tenantId } },
        });
        if (dbEntry) {
          await this.prisma.timetableEntry.delete({ where: { id: entryId } });
          await this.prisma.auditLog.create({
            data: {
              tenantId,
              action: 'TIMETABLE_SLOT_DELETED',
              resourceType: 'TimetableEntry',
              resourceId: entryId,
              afterData: { entryId } as any,
            },
          });
          this.prisma.memoryStore.timetableEntries.delete(entryId);
          return { success: true, message: 'Timetable entry removed successfully' };
        }
      } catch (err: any) {
        this.logger.warn(`Could not delete timetable entry from DB: ${err.message}`);
      }
    }

    const entry = this.prisma.memoryStore.timetableEntries.get(entryId);
    if (!entry || entry.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Timetable entry not found',
      });
    }

    this.prisma.memoryStore.timetableEntries.delete(entryId);
    return { success: true, message: 'Timetable entry removed successfully' };
  }
}
