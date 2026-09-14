import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  ScheduleScreeningDto,
  RecordScreeningOutcomeDto,
  ScheduleEntranceTestDto,
  RecordEntranceTestScoreDto,
} from '../dto/admission-screening.dto.js';
import { AdmissionApplicationService } from './admission-application.service.js';

@Injectable()
export class AdmissionScreeningService {
  private readonly logger = new Logger(AdmissionScreeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationService: AdmissionApplicationService,
  ) {}

  // --- SCREENING ---
  async scheduleScreening(
    tenantId: string,
    applicationId: string,
    scheduledByUserId: string,
    dto: ScheduleScreeningDto,
  ) {
    const app = await this.applicationService.getApplicationById(tenantId, applicationId);
    const id = `scr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const screening = {
      id,
      tenantId,
      campusId: app.campusId,
      applicationId,
      screeningDate: new Date(dto.screeningDate),
      mode: dto.mode || 'IN_PERSON',
      location: dto.location || null,
      scheduledByUserId,
      reviewerUserId: dto.reviewerUserId || null,
      notes: dto.notes || null,
      outcome: 'PENDING',
      score: null,
      recommendations: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionScreening) {
      try {
        await (this.prisma as any).admissionScreening.create({ data: screening });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionScreening failed: ${err.message}`);
      }
    }

    this.prisma.memoryStore.admissionScreenings.set(id, screening);

    if (app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW') {
      await this.applicationService.transitionStatus(tenantId, applicationId, {
        status: 'SCREENING',
        internalNotes: `Screening scheduled for ${screening.screeningDate.toISOString()}`,
      });
    }

    this.logger.log(`Scheduled screening ${id} for application ${applicationId}`);
    return screening;
  }

  async recordScreeningOutcome(
    tenantId: string,
    screeningId: string,
    dto: RecordScreeningOutcomeDto,
  ) {
    const screening = this.prisma.memoryStore.admissionScreenings.get(screeningId);
    if (!screening || screening.tenantId !== tenantId) {
      throw new NotFoundException(`Screening record ${screeningId} not found`);
    }

    const updated = {
      ...screening,
      outcome: dto.outcome,
      score: dto.score !== undefined ? dto.score : screening.score,
      notes: dto.notes ? `${screening.notes || ''}\nOutcome: ${dto.notes}`.trim() : screening.notes,
      recommendations: dto.recommendations || screening.recommendations,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionScreenings.set(screeningId, updated);
    return updated;
  }

  // --- ENTRANCE TESTS ---
  async scheduleEntranceTest(
    tenantId: string,
    applicationId: string,
    dto: ScheduleEntranceTestDto,
  ) {
    const app = await this.applicationService.getApplicationById(tenantId, applicationId);
    const id = `tst_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const test = {
      id,
      tenantId,
      applicationId,
      subject: dto.subject.trim(),
      testDate: new Date(dto.testDate),
      maxScore: dto.maxScore || 100,
      scoreObtained: null,
      percentage: null,
      passMark: dto.passMark || 50,
      outcome: 'PENDING',
      examinerUserId: dto.examinerUserId || null,
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionEntranceTest) {
      try {
        await (this.prisma as any).admissionEntranceTest.create({ data: test });
      } catch (err: any) {
        this.logger.warn(`Prisma create entranceTest failed: ${err.message}`);
      }
    }

    this.prisma.memoryStore.admissionEntranceTests.set(id, test);

    if (app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW' || app.status === 'SCREENING') {
      await this.applicationService.transitionStatus(tenantId, applicationId, {
        status: 'ENTRANCE_TEST',
        internalNotes: `Entrance test in ${test.subject} scheduled for ${test.testDate.toISOString()}`,
      });
    }

    this.logger.log(`Scheduled entrance test ${id} (${dto.subject}) for application ${applicationId}`);
    return test;
  }

  async recordEntranceTestScore(
    tenantId: string,
    testId: string,
    dto: RecordEntranceTestScoreDto,
  ) {
    const test = this.prisma.memoryStore.admissionEntranceTests.get(testId);
    if (!test || test.tenantId !== tenantId) {
      throw new NotFoundException(`Entrance test ${testId} not found`);
    }

    if (dto.scoreObtained > test.maxScore) {
      throw new BadRequestException(`Score obtained (${dto.scoreObtained}) cannot exceed max score (${test.maxScore})`);
    }

    const percentage = Number(((dto.scoreObtained / test.maxScore) * 100).toFixed(2));
    const outcome = percentage >= test.passMark ? 'PASSED' : 'FAILED';

    const updated = {
      ...test,
      scoreObtained: dto.scoreObtained,
      percentage,
      outcome,
      notes: dto.notes ? `${test.notes || ''}\n${dto.notes}`.trim() : test.notes,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionEntranceTests.set(testId, updated);
    this.logger.log(`Entrance test ${testId} scored: ${dto.scoreObtained}/${test.maxScore} (${percentage}%) -> ${outcome}`);
    return updated;
  }

  async listScreenings(tenantId: string, applicationId?: string) {
    return Array.from(this.prisma.memoryStore.admissionScreenings.values()).filter(
      (s: any) => s.tenantId === tenantId && (!applicationId || s.applicationId === applicationId),
    );
  }

  async listEntranceTests(tenantId: string, applicationId?: string) {
    return Array.from(this.prisma.memoryStore.admissionEntranceTests.values()).filter(
      (t: any) => t.tenantId === tenantId && (!applicationId || t.applicationId === applicationId),
    );
  }
}
