import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { DisciplineModule } from '../src/modules/discipline/discipline.module.js';
import { DisciplineIncidentService } from '../src/modules/discipline/services/discipline-incident.service.js';
import { DisciplinaryActionService } from '../src/modules/discipline/services/disciplinary-action.service.js';
import { DetentionService } from '../src/modules/discipline/services/detention.service.js';
import { ConfigModule } from '@nestjs/config';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('TASK 28: Discipline — Disciplinary Actions & Detention Records', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let incidentService: DisciplineIncidentService;
  let actionService: DisciplinaryActionService;
  let detentionService: DetentionService;

  const tenantId = 'tenant_act_01';
  const campusId = 'campus_act_01';
  const classId = 'cls_grade11_act';
  const staffId = 'staff_vice_principal';
  const student1Id = 'std_act_tobi_01';
  const student2Id = 'std_act_david_02';

  let incidentId: string;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, QueuesModule, DisciplineModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    incidentService = moduleRef.get<DisciplineIncidentService>(DisciplineIncidentService);
    actionService = moduleRef.get<DisciplinaryActionService>(DisciplinaryActionService);
    detentionService = moduleRef.get<DetentionService>(DetentionService);

    prisma.memoryStore.tenants.set(tenantId, { id: tenantId, name: 'Corona Secondary School' });
    prisma.memoryStore.campuses.set(campusId, { id: campusId, tenantId, name: 'Lekki Campus' });
    prisma.memoryStore.classes.set(classId, { id: classId, tenantId, campusId, name: 'SSS 1A' });

    prisma.memoryStore.students.set(student1Id, {
      id: student1Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Tobi',
      lastName: 'Alabi',
      admissionNumber: 'SCH/2026/032',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(student2Id, {
      id: student2Id,
      tenantId,
      campusId,
      classId,
      firstName: 'David',
      lastName: 'Alabi',
      admissionNumber: 'SCH/2026/021',
      status: 'ACTIVE',
    });

    const inc = await incidentService.reportIncident(tenantId, staffId, {
      studentId: student1Id,
      title: 'Disruptive classroom behavior during lecture',
      description: 'Repeated noise making and defiance of teacher instructions.',
      category: 'DISRUPTIVE_BEHAVIOR',
      severity: 'MODERATE',
      demeritPoints: 3,
    });
    incidentId = inc.id;
  });

  it('should assign a disciplinary action sanction and transition incident status', async () => {
    const action = await actionService.assignAction(tenantId, staffId, {
      incidentId,
      studentId: student1Id,
      sanctionType: 'PARENT_CONFERENCE',
      title: 'Mandatory Pastoral Guidance Conference',
      description: 'Conference with parents and School Guidance Counselor.',
      startDate: new Date().toISOString(),
    });

    expect(action.id).toBeDefined();
    expect(action.sanctionType).toBe('PARENT_CONFERENCE');
    expect(action.status).toBe('SCHEDULED');
    expect(action.studentName).toBe('Tobi Alabi');

    // Incident status transitioned to ACTION_PENDING
    const updatedInc = await incidentService.getIncidentById(tenantId, incidentId);
    expect(updatedInc.status).toBe('ACTION_PENDING');

    // Complete action
    const completedAction = await actionService.updateActionStatus(tenantId, action.id, staffId, {
      status: 'COMPLETED',
      completionNotes: 'Conference held successfully. Student agreed to behavioral improvement plan.',
    });

    expect(completedAction.status).toBe('COMPLETED');
    expect(completedAction.completedAt).toBeDefined();
    expect(completedAction.verifiedByUserId).toBe(staffId);
  });

  it('should schedule detention session and assign students with capacity and duplicate validation', async () => {
    const sessionDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const session = await detentionService.createSession(tenantId, staffId, {
      campusId,
      title: 'Friday Afternoon Supervised Study Detention',
      date: sessionDate,
      startTime: '15:30',
      endTime: '17:00',
      location: 'Main Library Room 4',
      maxCapacity: 2, // low capacity for test
    });

    expect(session.id).toBeDefined();
    expect(session.campusName).toBe('Lekki Campus');

    // Assign student 1
    const assign1 = await detentionService.assignStudent(tenantId, staffId, {
      sessionId: session.id,
      studentId: student1Id,
      incidentId,
      reflectionNotes: 'Reflective essay on classroom respect required.',
    });
    expect(assign1.attendanceStatus).toBe('ASSIGNED');

    // Duplicate assignment rejected
    await expect(
      detentionService.assignStudent(tenantId, staffId, {
        sessionId: session.id,
        studentId: student1Id,
      }),
    ).rejects.toThrow(ConflictException);

    // Assign student 2
    await detentionService.assignStudent(tenantId, staffId, {
      sessionId: session.id,
      studentId: student2Id,
    });

    // 3rd student exceeds capacity
    const student3Id = 'std_act_third_03';
    prisma.memoryStore.students.set(student3Id, {
      id: student3Id,
      tenantId,
      campusId,
      classId,
      firstName: 'Third',
      lastName: 'Student',
      admissionNumber: 'SCH/2026/033',
      status: 'ACTIVE',
    });

    await expect(
      detentionService.assignStudent(tenantId, staffId, {
        sessionId: session.id,
        studentId: student3Id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should mark detention attendance and reflection task status', async () => {
    const session = await detentionService.createSession(tenantId, staffId, {
      campusId,
      title: 'Saturday Morning Detention',
      date: new Date().toISOString(),
      startTime: '09:00',
      endTime: '11:00',
      location: 'Hall B',
    });

    const assignment = await detentionService.assignStudent(tenantId, staffId, {
      sessionId: session.id,
      studentId: student1Id,
    });

    const attended = await detentionService.recordAttendance(tenantId, assignment.id, staffId, {
      attendanceStatus: 'ATTENDED',
      reflectionNotes: 'Completed 2-hour supervised study and submitted reflection worksheet.',
    });

    expect(attended.attendanceStatus).toBe('ATTENDED');
    expect(attended.markedAt).toBeDefined();
    expect(attended.markedByUserId).toBe(staffId);
  });
});
