import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTimetableDto, CreateTimetableEntryDto } from './dto/create-timetable.dto.js';
import { ErrorCodes } from '../../common/constants/error-codes.js';

@Injectable()
export class TimetableService {
  constructor(private readonly prisma: PrismaService) {}

  async createTimetable(tenantId: string, dto: CreateTimetableDto) {
    const id = `tt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timetable = {
      id,
      tenantId,
      campusId: dto.campusId || 'campus_main_01',
      classId: dto.classId,
      academicYearId: dto.academicYearId,
      termId: dto.termId,
      name: dto.name || 'Class Timetable',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.timetables.set(id, timetable);
    return timetable;
  }

  async getTimetableByClass(tenantId: string, classId: string, termId?: string) {
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
          subjectName: subject.name,
          teacherName: `${teacher.firstName} ${teacher.lastName}`.trim(),
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return { timetable, entries };
  }

  async getTeacherSchedule(tenantId: string, teacherId: string) {
    const entries = Array.from(this.prisma.memoryStore.timetableEntries.values())
      .filter((e) => e.tenantId === tenantId && e.teacherId === teacherId)
      .map((entry) => {
        const timetable = this.prisma.memoryStore.timetables.get(entry.timetableId);
        const cls = timetable ? this.prisma.memoryStore.classes.get(timetable.classId) : null;
        const subject = this.prisma.memoryStore.subjects.get(entry.subjectId);
        return {
          ...entry,
          className: cls?.name || 'Class',
          subjectName: subject?.name || 'Subject',
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return entries;
  }

  async addEntry(tenantId: string, dto: CreateTimetableEntryDto) {
    // Conflict detection: Check if teacher or classroom is already scheduled during this day & overlapping time
    const existingEntries = Array.from(this.prisma.memoryStore.timetableEntries.values()).filter(
      (e) => e.tenantId === tenantId && e.dayOfWeek === dto.dayOfWeek,
    );

    for (const existing of existingEntries) {
      const isTimeOverlap =
        (dto.startTime >= existing.startTime && dto.startTime < existing.endTime) ||
        (dto.endTime > existing.startTime && dto.endTime <= existing.endTime) ||
        (dto.startTime <= existing.startTime && dto.endTime >= existing.endTime);

      if (isTimeOverlap) {
        if (existing.teacherId === dto.teacherId) {
          throw new ConflictException({
            errorCode: ErrorCodes.CONFLICT,
            message: `Teacher is already booked for another period on ${dto.dayOfWeek} between ${existing.startTime} and ${existing.endTime}`,
          });
        }
        if (dto.classroom && existing.classroom && existing.classroom.toLowerCase() === dto.classroom.toLowerCase()) {
          throw new ConflictException({
            errorCode: ErrorCodes.CONFLICT,
            message: `Classroom ${dto.classroom} is already occupied on ${dto.dayOfWeek} between ${existing.startTime} and ${existing.endTime}`,
          });
        }
      }
    }

    const id = `tte_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entry = {
      id,
      tenantId,
      ...dto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.timetableEntries.set(id, entry);
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
    this.prisma.memoryStore.timetableEntries.delete(entryId);
    return { success: true, message: 'Timetable entry removed successfully' };
  }
}
