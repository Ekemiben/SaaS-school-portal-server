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
    const existingInterviews = Array.from(this.prisma.memoryStore.admissionInterviews.values()).filter(
      (i: any) =>
        i.tenantId === tenantId &&
        i.interviewerUserId === dto.interviewerUserId &&
        i.outcome !== 'RESCHEDULED' &&
        Math.abs(new Date(i.interviewDate).getTime() - targetDate.getTime()) < thirtyMinutesMs,
    );

    if (existingInterviews.length > 0) {
      throw new ConflictException(
        `Interviewer already has an interview scheduled near ${targetDate.toISOString()}. Please choose another slot or interviewer.`,
      );
    }

    const id = `int_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const interview = {
      id,
      tenantId,
      applicationId,
      interviewDate: targetDate,
      mode: dto.mode || 'IN_PERSON',
      interviewerUserId: dto.interviewerUserId,
      interviewerName: dto.interviewerName || null,
      location: dto.location || null,
      meetingLink: dto.meetingLink || null,
      evaluationNotes: dto.notes || null,
      score: null,
      outcome: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionInterview) {
      try {
        await (this.prisma as any).admissionInterview.create({ data: interview });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionInterview failed: ${err.message}`);
      }
    }

    this.prisma.memoryStore.admissionInterviews.set(id, interview);

    if (['SUBMITTED', 'UNDER_REVIEW', 'SCREENING', 'ENTRANCE_TEST'].includes(app.status)) {
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
    const interview = this.prisma.memoryStore.admissionInterviews.get(interviewId);
    if (!interview || interview.tenantId !== tenantId) {
      throw new NotFoundException(`Interview ${interviewId} not found`);
    }

    const updated = {
      ...interview,
      outcome: dto.outcome,
      score: dto.score !== undefined ? dto.score : interview.score,
      evaluationNotes: dto.evaluationNotes
        ? `${interview.evaluationNotes || ''}\nEvaluation: ${dto.evaluationNotes}`.trim()
        : interview.evaluationNotes,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionInterviews.set(interviewId, updated);
    this.logger.log(`Interview ${interviewId} evaluated with outcome: ${dto.outcome}`);
    return updated;
  }

  async listInterviews(tenantId: string, applicationId?: string) {
    return Array.from(this.prisma.memoryStore.admissionInterviews.values()).filter(
      (i: any) => i.tenantId === tenantId && (!applicationId || i.applicationId === applicationId),
    );
  }
}
