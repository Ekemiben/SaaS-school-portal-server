import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { DisciplineModule } from '../src/modules/discipline/discipline.module.js';
import { DisciplineIncidentService } from '../src/modules/discipline/services/discipline-incident.service.js';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

describe('TASK 28: Discipline — Incident Reporting & Resolution Workflows', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let incidentService: DisciplineIncidentService;

  const tenantId = 'tenant_disc_01';
  const campusId = 'campus_disc_01';
  const classId = 'cls_grade10_disc';
  const staffId = 'staff_discipline_master';
  const student1Id = 'std_disc_emeka_01';
  const student2Id = 'std_disc_chinedu_02';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, DisciplineModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    incidentService = moduleRef.get<DisciplineIncidentService>(DisciplineIncidentService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'King’s College' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Main Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'SSS 3A' });

    prisma.memoryStore.students.set(student1Id, {
      id: student1Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Emeka',
      lastName: 'Nwosu',
      admissionNumber: 'SCH/2026/014',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(student2Id, {
      id: student2Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Chinedu',
      lastName: 'Okafor',
      admissionNumber: 'SCH/2026/001',
      status: 'ACTIVE',
    });
  });

  it('should log a behavioral incident with category, severity, demerits, and evidence', async () => {
    const incident = await incidentService.reportIncident(tenantId, staffId, {
      studentId: student1Id,
      classId,
      campusId,
      title: 'Repeated late arrival for assembly',
      description: 'Arrived 25 minutes late for morning assembly without valid excuse.',
      category: 'TARDINESS',
      severity: 'MINOR',
      demeritPoints: 2,
      location: 'Main School Gate',
      parentNotified: true,
      witnessNames: ['Prefect Ade', 'Gate Officer Musa'],
    });

    expect(incident.id).toBeDefined();
    expect(incident.incidentCode).toMatch(/^INC-\d{4}-\d{4}$/);
    expect(incident.studentName).toBe('Emeka Nwosu');
    expect(incident.demeritPoints).toBe(2);
    expect(incident.category).toBe('TARDINESS');
    expect(incident.status).toBe('REPORTED');
    expect(incident.parentNotified).toBe(true);
    expect(incident.witnessNames).toHaveLength(2);
  });

  it('should filter and search logged behavioral incidents', async () => {
    await incidentService.reportIncident(tenantId, staffId, {
      studentId: student1Id,
      title: 'Uniform dress code violation',
      description: 'Wearing casual sneakers instead of formal regulation footwear.',
      category: 'DRESS_CODE',
      severity: 'MINOR',
      demeritPoints: 1,
    });

    await incidentService.reportIncident(tenantId, staffId, {
      studentId: student2Id,
      title: 'Altercation during recess in courtyard',
      description: 'Physical confrontation near cafeteria.',
      category: 'PHYSICAL_ALTERCATION',
      severity: 'MAJOR',
      demeritPoints: 5,
    });

    // Filter by student
    const student1Incidents = await incidentService.getIncidents(tenantId, { studentId: student1Id });
    expect(student1Incidents).toHaveLength(1);
    expect(student1Incidents[0].category).toBe('DRESS_CODE');

    // Filter by category
    const altercations = await incidentService.getIncidents(tenantId, { category: 'PHYSICAL_ALTERCATION' });
    expect(altercations).toHaveLength(1);
    expect(altercations[0].studentName).toBe('Chinedu Okafor');

    // Search keyword
    const searched = await incidentService.getIncidents(tenantId, { search: 'cafeteria' });
    expect(searched).toHaveLength(1);
    expect(searched[0].title).toContain('Altercation');
  });

  it('should resolve incident with resolution notes and status transition', async () => {
    const incident = await incidentService.reportIncident(tenantId, staffId, {
      studentId: student1Id,
      title: 'Incomplete Science homework',
      description: 'Failed to submit homework for two consecutive deadlines.',
      category: 'HOMEWORK_NEGLECT',
      severity: 'MINOR',
      demeritPoints: 1,
    });

    const resolved = await incidentService.resolveIncident(tenantId, incident.id, staffId, {
      resolutionNotes: 'Completed remedial assignment during study hour and submitted to teacher.',
      notifyParent: true,
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNotes).toContain('Completed remedial assignment');
    expect(resolved.resolvedAt).toBeDefined();
    expect(resolved.resolvedByUserId).toBe(staffId);
    expect(resolved.parentNotified).toBe(true);
  });
});
