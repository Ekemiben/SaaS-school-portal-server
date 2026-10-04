import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { ScheduleInterviewDto, EvaluateInterviewDto } from '../dto/admission-interview.dto.js';
import { AdmissionApplicationService } from './admission-application.service.js';

@Injectable()
export class AdmissionInterviewService {
  private readonly logger = new Logger(AdmissionInterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationService: AdmissionApplicationService,
  ) {}

  async scheduleInterview(
    tenantId: string,
    applicationId: string,
    dto: ScheduleInterviewDto,
  ) {
    const app = await this.applicationService.getApplicationById(tenantId, applicationId);
    const targetDate = new Date(dto.interviewDate);

    // Conflict detection: verify interviewer is not double-booked within a 30-minute window
    const thirtyMinutesMs = 30 * 60 * 1000;
    const existingInterviews = await this.prisma.admissionInterview.findMany({
      where: {
        tenantId,
        interviewerUserId: dto.interviewerUserId,
        outcome: { not: 'RESCHEDULED' },
      },
    });

    const hasConflict = existingInterviews.some(
      (i) => Math.abs(new Date(i.interviewDate).getTime() - targetDate.getTime()) < thirtyMinutesMs,
    );

    if (hasConflict) {
      throw new ConflictException(
        `Interviewer already has an interview scheduled near ${targetDate.toISOString()}. Please choose another slot or interviewer.`,
      );
    }

    const id = `int_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const interview = await this.prisma.admissionInterview.create({
      data: {
        id,
        tenantId,
        applicationId,
        interviewDate: targetDate,
        interviewerUserId: dto.interviewerUserId,
        evaluationNotes: dto.notes || null,
        score: null,
        outcome: 'PENDING',
      },
    });

    if (['SUBMITTED', 'UNDER_REVIEW', 'SCREENING', 'ENTRANCE_TEST'].includes(app.rawStatus || app.status)) {
      await this.applicationService.transitionStatus(tenantId, applicationId, {
        status: 'INTERVIEW',
        internalNotes: `Interview scheduled with ${dto.interviewerName || dto.interviewerUserId} for ${interview.interviewDate.toISOString()}`,
      });
    }

    this.logger.log(`Scheduled interview ${id} for application ${applicationId}`);
    return interview;
  }

  async evaluateInterview(
    tenantId: string,
    interviewId: string,
    dto: EvaluateInterviewDto,
  ) {
    const interview = await this.prisma.admissionInterview.findFirst({
      where: { id: interviewId, tenantId },
    });
    if (!interview) {
      throw new NotFoundException(`Interview ${interviewId} not found`);
    }

    const updated = await this.prisma.admissionInterview.update({
      where: { id: interviewId },
      data: {
        outcome: dto.outcome,
        score: dto.score !== undefined ? dto.score : interview.score,
        evaluationNotes: dto.evaluationNotes
          ? `${interview.evaluationNotes || ''}\nEvaluation: ${dto.evaluationNotes}`.trim()
          : interview.evaluationNotes,
      },
    });

    this.logger.log(`Interview ${interviewId} evaluated with outcome: ${dto.outcome}`);
    return updated;
  }

  async listInterviews(tenantId: string, applicationId?: string) {
    return this.prisma.admissionInterview.findMany({
      where: {
        tenantId,
        ...(applicationId ? { applicationId } : {}),
      },
      orderBy: { interviewDate: 'desc' },
    });
  }
}
