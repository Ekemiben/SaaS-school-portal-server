import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { DisciplineModule } from '../src/modules/discipline/discipline.module.js';
import { DisciplineIncidentService } from '../src/modules/discipline/services/discipline-incident.service.js';
import { DisciplinaryActionService } from '../src/modules/discipline/services/disciplinary-action.service.js';
import { DetentionService } from '../src/modules/discipline/services/detention.service.js';
import { MeritAwardService } from '../src/modules/discipline/services/merit-award.service.js';
import { ConductProfileService } from '../src/modules/discipline/services/conduct-profile.service.js';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

describe('TASK 28: Discipline — Multi-Tenant Isolation & Security Boundaries', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let incidentService: DisciplineIncidentService;
  let actionService: DisciplinaryActionService;
  let detentionService: DetentionService;
  let meritService: MeritAwardService;
  let conductService: ConductProfileService;

  const tenantAlpha = 'tenant_disc_iso_alpha';
  const tenantBeta = 'tenant_disc_iso_beta';

  const campusAlpha = 'campus_disc_iso_alpha';
  const campusBeta = 'campus_disc_iso_beta';

  const classAlpha = 'cls_disc_iso_alpha';
  const classBeta = 'cls_disc_iso_beta';

  const studentAlpha = 'std_disc_iso_alpha';
  const studentBeta = 'std_disc_iso_beta';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, DisciplineModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    incidentService = moduleRef.get<DisciplineIncidentService>(DisciplineIncidentService);
    actionService = moduleRef.get<DisciplinaryActionService>(DisciplinaryActionService);
    detentionService = moduleRef.get<DetentionService>(DetentionService);
    meritService = moduleRef.get<MeritAwardService>(MeritAwardService);
    conductService = moduleRef.get<ConductProfileService>(ConductProfileService);

    // Tenant Alpha
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Alpha Academy' });
    prisma.memoryStore.campuses.set(campusAlpha, { id: campusAlpha, tenantId: tenantAlpha, name: 'Alpha Campus' });
    prisma.memoryStore.classes.set(classAlpha, { id: classAlpha, tenantId: tenantAlpha, campusId: campusAlpha, name: 'Alpha Class' });
    prisma.memoryStore.students.set(studentAlpha, {
      id: studentAlpha,
      tenantId: tenantAlpha,
      campusId: campusAlpha,
      classId: classAlpha,
      firstName: 'Alpha',
      lastName: 'Student',
      admissionNumber: 'SCH/A/001',
      status: 'ACTIVE',
    });

    // Tenant Beta
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Beta Grammar' });
    prisma.memoryStore.campuses.set(campusBeta, { id: campusBeta, tenantId: tenantBeta, name: 'Beta Campus' });
    prisma.memoryStore.classes.set(classBeta, { id: classBeta, tenantId: tenantBeta, campusId: campusBeta, name: 'Beta Class' });
    prisma.memoryStore.students.set(studentBeta, {
      id: studentBeta,
      tenantId: tenantBeta,
      campusId: campusBeta,
      classId: classBeta,
      firstName: 'Beta',
      lastName: 'Student',
      admissionNumber: 'SCH/B/001',
      status: 'ACTIVE',
    });
  });

  it('should prevent cross-tenant incident reporting and retrieval', async () => {
    // Beta attempts to report incident for Alpha student
    await expect(
      incidentService.reportIncident(tenantBeta, 'teacher_beta', {
        studentId: studentAlpha,
        title: 'Unauthorized Incident Report',
        description: 'Cross tenant attempt',
        category: 'TARDINESS',
      }),
    ).rejects.toThrow(NotFoundException);

    // Alpha reports legitimate incident
    const incAlpha = await incidentService.reportIncident(tenantAlpha, 'teacher_alpha', {
      studentId: studentAlpha,
      title: 'Alpha Incident',
      description: 'Optics lab misconduct',
      category: 'DISRUPTIVE_BEHAVIOR',
    });

    // Beta cannot view Alpha incident by ID
    await expect(
      incidentService.getIncidentById(tenantBeta, incAlpha.id),
    ).rejects.toThrow(NotFoundException);

    // Beta incident list is empty
    const betaList = await incidentService.getIncidents(tenantBeta, {});
    expect(betaList).toHaveLength(0);
  });

  it('should prevent cross-tenant disciplinary actions and detentions', async () => {
    const incAlpha = await incidentService.reportIncident(tenantAlpha, 'teacher_alpha', {
      studentId: studentAlpha,
      title: 'Alpha Incident',
      description: 'Desc',
      category: 'TARDINESS',
    });

    // Beta attempts to assign action to Alpha incident
    await expect(
      actionService.assignAction(tenantBeta, 'teacher_beta', {
        incidentId: incAlpha.id,
        studentId: studentBeta,
        sanctionType: 'VERBAL_WARNING',
        title: 'Cross tenant sanction',
      }),
    ).rejects.toThrow(NotFoundException);

    // Alpha creates detention session
    const detAlpha = await detentionService.createSession(tenantAlpha, 'teacher_alpha', {
      campusId: campusAlpha,
      title: 'Alpha Detention',
      date: new Date().toISOString(),
      startTime: '16:00',
      endTime: '17:00',
      location: 'Hall A',
    });

    // Beta attempts to assign Beta student to Alpha detention session
    await expect(
      detentionService.assignStudent(tenantBeta, 'teacher_beta', {
        sessionId: detAlpha.id,
        studentId: studentBeta,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should prevent cross-tenant merit awards and conduct profile queries', async () => {
    // Beta attempts to award merit to Alpha student
    await expect(
      meritService.awardMerit(tenantBeta, 'teacher_beta', {
        studentId: studentAlpha,
        category: 'LEADERSHIP',
        title: 'Cross tenant award',
      }),
    ).rejects.toThrow(NotFoundException);

    // Beta attempts to query conduct profile for Alpha student
    await expect(
      conductService.getStudentConductProfile(tenantBeta, studentAlpha),
    ).rejects.toThrow(NotFoundException);
  });
});
