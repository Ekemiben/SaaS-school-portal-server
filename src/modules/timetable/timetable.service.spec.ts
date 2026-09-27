import { describe, it, expect, beforeEach } from 'vitest';
import { TimetableService } from './timetable.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('TimetableService Conflict Detection & Allocation Engine', () => {
  let timetableService: TimetableService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = new PrismaService();
    timetableService = new TimetableService(prisma);
  });

  it('should create timetable and allow entry without conflict', async () => {
    const timetable = await timetableService.createTimetable('tnt_demo_school', {
      academicYearId: 'ay_demo_2026',
      termId: 'term_first',
      classId: 'cls_demo_grade10a',
    });

    const entry = await timetableService.addEntry('tnt_demo_school', {
      timetableId: timetable.id,
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '09:00',
      subjectId: 'subj_math',
      teacherId: 'tch_01',
      room: 'Room 101',
    });

    expect(entry).toBeDefined();
    expect(entry.subjectId).toBe('subj_math');
  });

  it('should detect and reject room or teacher conflict', async () => {
    const timetable = await timetableService.createTimetable('tnt_demo_school', {
      academicYearId: 'ay_demo_2026',
      termId: 'term_first',
      classId: 'cls_demo_grade10b',
    });

    await timetableService.addEntry('tnt_demo_school', {
      timetableId: timetable.id,
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '11:00',
      subjectId: 'subj_science',
      teacherId: 'tch_physics',
      room: 'Lab A',
    });

    // Attempt overlapping schedule for same teacher
    await expect(
      timetableService.addEntry('tnt_demo_school', {
        timetableId: timetable.id,
        dayOfWeek: 2,
        startTime: '10:30',
        endTime: '11:30',
        subjectId: 'subj_math',
        teacherId: 'tch_physics',
        room: 'Lab B',
      }),
    ).rejects.toThrow();

    // Attempt overlapping schedule for same room
    await expect(
      timetableService.addEntry('tnt_demo_school', {
        timetableId: timetable.id,
        dayOfWeek: 2,
        startTime: '10:30',
        endTime: '11:30',
        subjectId: 'subj_biology',
        teacherId: 'tch_bio',
        room: 'Lab A',
      }),
    ).rejects.toThrow();
  });

  it('should detect conflict on update and prevent collision', async () => {
    const timetable = await timetableService.createTimetable('tnt_demo_school', {
      academicYearId: 'ay_demo_2026',
      termId: 'term_first',
      classId: 'cls_demo_grade10c',
    });

    const entry1 = await timetableService.addEntry('tnt_demo_school', {
      timetableId: timetable.id,
      dayOfWeek: 3,
      startTime: '08:00',
      endTime: '08:45',
      subjectId: 'subj_chem',
      teacherId: 'tch_chem',
      room: 'Chemistry Lab',
    });

    const entry2 = await timetableService.addEntry('tnt_demo_school', {
      timetableId: timetable.id,
      dayOfWeek: 3,
      startTime: '08:45',
      endTime: '09:30',
      subjectId: 'subj_bio',
      teacherId: 'tch_bio',
      room: 'Biology Lab',
    });

    // Attempting to move entry2 into entry1's time slot and room should throw conflict
    await expect(
      timetableService.updateEntry('tnt_demo_school', entry2.id, {
        startTime: '08:00',
        endTime: '08:45',
        room: 'Chemistry Lab',
      }),
    ).rejects.toThrow();
  });

  it('should successfully delete an entry', async () => {
    const timetable = await timetableService.createTimetable('tnt_demo_school', {
      academicYearId: 'ay_demo_2026',
      termId: 'term_first',
      classId: 'cls_demo_grade10d',
    });

    const entry = await timetableService.addEntry('tnt_demo_school', {
      timetableId: timetable.id,
      dayOfWeek: 4,
      startTime: '08:00',
      endTime: '08:45',
      subjectId: 'subj_geo',
      teacherId: 'tch_geo',
      room: 'Room 204',
    });

    const deleteRes = await timetableService.deleteEntry('tnt_demo_school', entry.id);
    expect(deleteRes.success).toBe(true);
  });
});
