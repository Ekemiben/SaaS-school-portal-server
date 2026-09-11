import { describe, it, expect, beforeEach } from 'vitest';
import { TimetableService } from './timetable.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('TimetableService Conflict Detection', () => {
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
  });
});
