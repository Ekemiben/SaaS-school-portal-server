import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service.js';
import { AdmissionsModule } from '../src/modules/admissions/admissions.module.js';
import { AdmissionApplicationService } from '../src/modules/admissions/services/admission-application.service.js';
import { AdmissionScreeningService } from '../src/modules/admissions/services/admission-screening.service.js';
import { AdmissionInterviewService } from '../src/modules/admissions/services/admission-interview.service.js';
import { ConflictException } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

describe('TASK 24: Admissions — Screening, Entrance Testing & Interview Scheduling', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let applicationService: AdmissionApplicationService;
  let screeningService: AdmissionScreeningService;
  let interviewService: AdmissionInterviewService;

  const tenantAlpha = 'tenant_scr_alpha';
  const campusMain = 'campus_scr_main';
  const academicYear2026 = 'ay_2026_2027';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AdmissionsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    applicationService = moduleRef.get<AdmissionApplicationService>(AdmissionApplicationService);
    screeningService = moduleRef.get<AdmissionScreeningService>(AdmissionScreeningService);
    interviewService = moduleRef.get<AdmissionInterviewService>(AdmissionInterviewService);

    prisma.memoryStore.tenants.set(tenantAlpha, {
      id: tenantAlpha,
      name: 'Alpha International College',
    });
    prisma.memoryStore.campuses.set(campusMain, {
      id: campusMain,
      tenantId: tenantAlpha,
      name: 'Main Campus',
    });
  });

  async function createTestApp(firstName: string, lastName: string) {
    return applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusMain,
        academicYearId: academicYear2026,
        gradeLevel: 'Grade 7',
        studentFirstName: firstName,
        studentLastName: lastName,
        dateOfBirth: '2014-04-10',
        gender: 'MALE',
        parentFirstName: 'Parent',
        parentLastName: lastName,
        parentEmail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test.ng`,
        parentPhone: '+2348011223344',
      },
      true,
    );
  }

  it('should schedule screening and record screening outcome with score and recommendations', async () => {
    const app = await createTestApp('Ibrahim', 'Danjuma');

    const screening = await screeningService.scheduleScreening(
      tenantAlpha,
      app.id,
      'user_admin_01',
      {
        screeningDate: '2026-10-15T09:00:00Z',
        mode: 'IN_PERSON',
        location: 'Hall B, Main Campus',
        reviewerUserId: 'user_evaluator_01',
        notes: 'Initial behavioural & physical readiness screening.',
      },
    );

    expect(screening.id).toBeDefined();
    expect(screening.outcome).toBe('PENDING');

    // Verify application transitioned to SCREENING
    const appAfterSchedule = await applicationService.getApplicationById(tenantAlpha, app.id);
    expect(appAfterSchedule.status).toBe('SCREENING');

    const evaluated = await screeningService.recordScreeningOutcome(
      tenantAlpha,
      screening.id,
      {
        outcome: 'PASSED',
        score: 88,
        notes: 'Student demonstrated excellent verbal comprehension and readiness.',
        recommendations: 'Eligible for entrance examination and interview.',
      },
    );

    expect(evaluated.outcome).toBe('PASSED');
    expect(evaluated.score).toBe(88);
    expect(evaluated.recommendations).toContain('Eligible for entrance examination');
  });

  it('should schedule entrance tests and automatically evaluate pass/fail based on passMark', async () => {
    const app = await createTestApp('Amina', 'Yusuf');

    const mathTest = await screeningService.scheduleEntranceTest(tenantAlpha, app.id, {
      subject: 'Mathematics',
      testDate: '2026-10-16T10:00:00Z',
      maxScore: 100,
      passMark: 60,
      examinerUserId: 'user_math_hod',
    });

    expect(mathTest.outcome).toBe('PENDING');

    // Scored 85 -> Percentage 85% >= 60% -> PASSED
    const scoredPass = await screeningService.recordEntranceTestScore(tenantAlpha, mathTest.id, {
      scoreObtained: 85,
      notes: 'Strong in algebra and basic geometry.',
    });
    expect(scoredPass.percentage).toBe(85);
    expect(scoredPass.outcome).toBe('PASSED');

    // English test where student scored below passMark
    const engTest = await screeningService.scheduleEntranceTest(tenantAlpha, app.id, {
      subject: 'English Language',
      testDate: '2026-10-16T12:00:00Z',
      maxScore: 100,
      passMark: 50,
    });

    const scoredFail = await screeningService.recordEntranceTestScore(tenantAlpha, engTest.id, {
      scoreObtained: 42,
      notes: 'Needs improvement in essay comprehension.',
    });
    expect(scoredFail.percentage).toBe(42);
    expect(scoredFail.outcome).toBe('FAILED');
  });

  it('should schedule interviews and prevent double-booking conflicts for the same interviewer', async () => {
    const app1 = await createTestApp('David', 'Mark');
    const app2 = await createTestApp('Samuel', 'Eto');

    const interviewTime = '2026-10-18T14:00:00Z';
    const interviewer = 'user_principal_ade';

    // Schedule first interview
    const int1 = await interviewService.scheduleInterview(tenantAlpha, app1.id, {
      interviewDate: interviewTime,
      mode: 'IN_PERSON',
      interviewerUserId: interviewer,
      interviewerName: 'Principal Ade',
      location: 'Principal Office',
    });
    expect(int1.id).toBeDefined();

    // Schedule second interview with same interviewer within 30 mins window -> ConflictException
    const overlappingTime = '2026-10-18T14:15:00Z'; // 15 mins later
    await expect(
      interviewService.scheduleInterview(tenantAlpha, app2.id, {
        interviewDate: overlappingTime,
        mode: 'IN_PERSON',
        interviewerUserId: interviewer,
        interviewerName: 'Principal Ade',
      }),
    ).rejects.toThrow(ConflictException);

    // Schedule second interview 1 hour later -> Allowed
    const nonOverlappingTime = '2026-10-18T15:00:00Z';
    const int2 = await interviewService.scheduleInterview(tenantAlpha, app2.id, {
      interviewDate: nonOverlappingTime,
      mode: 'ONLINE',
      meetingLink: 'https://meet.google.com/xyz-abc-123',
      interviewerUserId: interviewer,
      interviewerName: 'Principal Ade',
    });
    expect(int2.id).toBeDefined();

    // Evaluate interview
    const evaluated = await interviewService.evaluateInterview(tenantAlpha, int1.id, {
      outcome: 'RECOMMENDED',
      score: 92,
      evaluationNotes: 'Confident, articulate, aligned with school values.',
    });
    expect(evaluated.outcome).toBe('RECOMMENDED');
    expect(evaluated.score).toBe(92);
  });
});
