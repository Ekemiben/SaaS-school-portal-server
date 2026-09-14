import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { DisciplineModule } from '../src/modules/discipline/discipline.module.js';
import { DisciplineIncidentService } from '../src/modules/discipline/services/discipline-incident.service.js';
import { MeritAwardService } from '../src/modules/discipline/services/merit-award.service.js';
import { ConductProfileService } from '../src/modules/discipline/services/conduct-profile.service.js';
import { ConfigModule } from '@nestjs/config';

describe('TASK 28: Discipline — Merits, Awards & Conduct Profile Reporting', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let incidentService: DisciplineIncidentService;
  let meritService: MeritAwardService;
  let conductService: ConductProfileService;

  const tenantId = 'tenant_merit_01';
  const campusId = 'campus_merit_01';
  const classId = 'cls_grade12_merit';
  const staffId = 'staff_principal';
  const student1Id = 'std_merit_zainab_01';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, DisciplineModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    incidentService = moduleRef.get<DisciplineIncidentService>(DisciplineIncidentService);
    meritService = moduleRef.get<MeritAwardService>(MeritAwardService);
    conductService = moduleRef.get<ConductProfileService>(ConductProfileService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Grange School' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Victoria Island Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'Year 12 A' });

    prisma.memoryStore.students.set(student1Id, {
      id: student1Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Zainab',
      lastName: 'Balogun',
      admissionNumber: 'SCH/2026/055',
      status: 'ACTIVE',
    });
  });

  it('should grant merit awards, badges, and citations', async () => {
    const merit1 = await meritService.awardMerit(tenantId, staffId, {
      studentId: student1Id,
      category: 'ACADEMIC_EXCELLENCE',
      title: 'Top Score in National Olympiad Mathematics',
      description: 'Gold medal score in National Junior Math Olympiad.',
      meritPoints: 10,
      badgeTier: 'GOLD',
      citationNotes: 'Outstanding mathematical reasoning and school representation.',
    });

    const merit2 = await meritService.awardMerit(tenantId, staffId, {
      studentId: student1Id,
      category: 'LEADERSHIP',
      title: 'Head of Student Council Initiative',
      description: 'Organized campus-wide peer tutoring program.',
      meritPoints: 8,
      badgeTier: 'SILVER',
    });

    expect(merit1.id).toBeDefined();
    expect(merit1.studentName).toBe('Zainab Balogun');
    expect(merit1.meritPoints).toBe(10);
    expect(merit1.badgeTier).toBe('GOLD');

    expect(merit2.meritPoints).toBe(8);
  });

  it('should calculate net conduct points, evaluate pastoral standing, and generate timeline', async () => {
    // Award 20 merits
    await meritService.awardMerit(tenantId, staffId, {
      studentId: student1Id,
      category: 'ACADEMIC_EXCELLENCE',
      title: 'High Distinction in Sciences',
      meritPoints: 20,
      badgeTier: 'PLATINUM',
    });

    // Log 2 demerit points
    await incidentService.reportIncident(tenantId, staffId, {
      studentId: student1Id,
      title: 'Uniform infraction',
      description: 'Forgot lab coat for Chemistry practical.',
      category: 'DRESS_CODE',
      demeritPoints: 2,
    });

    const profile = await conductService.getStudentConductProfile(tenantId, student1Id);

    expect(profile.studentName).toBe('Zainab Balogun');
    expect(profile.totalMeritPoints).toBe(20);
    expect(profile.totalDemeritPoints).toBe(2);
    expect(profile.netConductPoints).toBe(18); // 20 - 2
    expect(profile.standing).toBe('EXEMPLARY'); // >= 15 is EXEMPLARY
    expect(profile.timeline).toHaveLength(2);
  });

  it('should compute campus aggregated pastoral summary analytics', async () => {
    await incidentService.reportIncident(tenantId, staffId, {
      studentId: student1Id,
      category: 'TARDINESS',
      title: 'Late',
      description: 'Late arrival',
      demeritPoints: 1,
    });

    await meritService.awardMerit(tenantId, staffId, {
      studentId: student1Id,
      category: 'SPORTSMANSHIP',
      title: 'Football Captain',
      meritPoints: 5,
    });

    const summary = await conductService.getCampusConductSummary(tenantId, { campusId });

    expect(summary.totalIncidents).toBe(1);
    expect(summary.totalMeritAwards).toBe(1);
    expect(summary.totalDemeritPoints).toBe(1);
    expect(summary.totalMeritPoints).toBe(5);
    expect(summary.topInfractions).toHaveLength(1);
    expect(summary.topInfractions[0].category).toBe('TARDINESS');
  });
});
