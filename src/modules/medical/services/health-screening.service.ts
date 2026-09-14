import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { MedicalProfileService } from './medical-profile.service.js';
import {
  RecordHealthScreeningDto,
  BatchScreeningDto,
  HealthScreeningFilterDto,
  ScreeningType,
  ScreeningOutcome,
} from '../dto/health-screening.dto.js';
import { randomUUID } from 'crypto';

export interface HealthScreeningRecord {
  id: string;
  tenantId: string;
  studentId: string;
  studentName?: string;
  screeningType: ScreeningType;
  outcome: ScreeningOutcome;
  screenerName: string;
  screenerDesignation: string;
  screeningDate: string;
  findings: string;
  referralRecommended: boolean;
  referralDestination?: string;
  followUpDueDate?: string;
  notes?: string;
  createdAt: string;
}

@Injectable()
export class HealthScreeningService {
  private readonly logger = new Logger(HealthScreeningService.name);
  private readonly fallbackScreenings: HealthScreeningRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalProfileService: MedicalProfileService,
  ) {}

  async recordScreening(
    tenantId: string,
    dto: RecordHealthScreeningDto,
  ): Promise<HealthScreeningRecord> {
    let studentName = 'Student';
    try {
      const profile = await this.medicalProfileService.getMedicalProfile(
        tenantId,
        dto.studentId,
      );
      if (profile?.student?.fullName) {
        studentName = profile.student.fullName;
      }
    } catch {
      // student may exist in prisma directly
    }

    const record: HealthScreeningRecord = {
      id: `scr_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      tenantId,
      studentId: dto.studentId,
      studentName,
      screeningType: dto.screeningType,
      outcome: dto.outcome,
      screenerName: dto.screenerName,
      screenerDesignation: dto.screenerDesignation,
      screeningDate: dto.screeningDate,
      findings: dto.findings,
      referralRecommended: dto.referralRecommended ?? (dto.outcome === ScreeningOutcome.URGENT_REFERRAL || dto.outcome === ScreeningOutcome.FOLLOW_UP_REQUIRED),
      referralDestination: dto.referralDestination,
      followUpDueDate: dto.followUpDueDate,
      notes: dto.notes,
      createdAt: new Date().toISOString(),
    };

    this.fallbackScreenings.push(record);
    this.logger.log(`Recorded health screening ${record.id} for student ${dto.studentId}`);
    return record;
  }

  async batchRecordScreening(
    tenantId: string,
    dto: BatchScreeningDto,
  ) {
    let successCount = 0;
    const errors: Array<{ studentId: string; error: string }> = [];
    const createdRecords: HealthScreeningRecord[] = [];

    for (const studentId of dto.studentIds) {
      try {
        const screening = await this.recordScreening(tenantId, {
          ...dto.screeningTemplate,
          studentId,
        });
        createdRecords.push(screening);
        successCount++;
      } catch (err: any) {
        errors.push({ studentId, error: err.message });
      }
    }

    return {
      tenantId,
      totalAttempted: dto.studentIds.length,
      successCount,
      errorsCount: errors.length,
      errors,
      screeningType: dto.screeningTemplate.screeningType,
      records: createdRecords,
    };
  }

  async getScreenings(
    tenantId: string,
    filter?: HealthScreeningFilterDto,
  ): Promise<HealthScreeningRecord[]> {
    let results = this.fallbackScreenings.filter((s) => s.tenantId === tenantId);

    if (filter?.studentId) {
      results = results.filter((s) => s.studentId === filter.studentId);
    }
    if (filter?.screeningType) {
      results = results.filter((s) => s.screeningType === filter.screeningType);
    }
    if (filter?.outcome) {
      results = results.filter((s) => s.outcome === filter.outcome);
    }

    return results;
  }

  async getScreeningById(tenantId: string, id: string): Promise<HealthScreeningRecord> {
    const screening = this.fallbackScreenings.find(
      (s) => s.tenantId === tenantId && s.id === id,
    );
    if (!screening) {
      throw new NotFoundException(`Health screening record with ID ${id} not found`);
    }
    return screening;
  }

  async getPendingFollowUps(tenantId: string): Promise<HealthScreeningRecord[]> {
    return this.fallbackScreenings.filter(
      (s) =>
        s.tenantId === tenantId &&
        (s.outcome === ScreeningOutcome.FOLLOW_UP_REQUIRED ||
          s.outcome === ScreeningOutcome.URGENT_REFERRAL ||
          s.referralRecommended),
    );
  }
}
