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

    const screening = await this.prisma.admissionScreening.create({
      data: {
        id,
        tenantId,
        applicationId,
        screeningDate: new Date(dto.screeningDate),
        scheduledByUserId,
        reviewerUserId: dto.reviewerUserId || null,
        notes: dto.notes || null,
        outcome: 'PENDING',
        score: null,
      },
    });

    if (app.rawStatus === 'SUBMITTED' || app.rawStatus === 'UNDER_REVIEW') {
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
    const screening = await this.prisma.admissionScreening.findFirst({
      where: { id: screeningId, tenantId },
    });
    if (!screening) {
      throw new NotFoundException(`Screening record ${screeningId} not found`);
    }

    const updated = await this.prisma.admissionScreening.update({
      where: { id: screeningId },
      data: {
        outcome: dto.outcome,
        score: dto.score !== undefined ? dto.score : screening.score,
        notes: dto.notes ? `${screening.notes || ''}\nOutcome: ${dto.notes}`.trim() : screening.notes,
      },
    });

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

    const test = await this.prisma.admissionEntranceTest.create({
      data: {
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
      },
    });

    if (app.rawStatus === 'SUBMITTED' || app.rawStatus === 'UNDER_REVIEW' || app.rawStatus === 'SCREENING') {
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
    const test = await this.prisma.admissionEntranceTest.findFirst({
      where: { id: testId, tenantId },
    });
    if (!test) {
      throw new NotFoundException(`Entrance test ${testId} not found`);
    }

    if (dto.scoreObtained > test.maxScore) {
      throw new BadRequestException(`Score obtained (${dto.scoreObtained}) cannot exceed max score (${test.maxScore})`);
    }

    const percentage = Number(((dto.scoreObtained / test.maxScore) * 100).toFixed(2));
    const outcome = percentage >= test.passMark ? 'PASSED' : 'FAILED';

    const updated = await this.prisma.admissionEntranceTest.update({
      where: { id: testId },
      data: {
        scoreObtained: dto.scoreObtained,
        percentage,
        outcome,
        notes: dto.notes ? `${test.notes || ''}\n${dto.notes}`.trim() : test.notes,
      },
    });

    this.logger.log(`Entrance test ${testId} scored: ${dto.scoreObtained}/${test.maxScore} (${percentage}%) -> ${outcome}`);
    return updated;
  }

  async listScreenings(tenantId: string, applicationId?: string) {
    return this.prisma.admissionScreening.findMany({
      where: {
        tenantId,
        ...(applicationId ? { applicationId } : {}),
      },
      orderBy: { screeningDate: 'desc' },
    });
  }

  async listEntranceTests(tenantId: string, applicationId?: string) {
    return this.prisma.admissionEntranceTest.findMany({
      where: {
        tenantId,
        ...(applicationId ? { applicationId } : {}),
      },
      orderBy: { testDate: 'desc' },
    });
  }
}
