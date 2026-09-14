import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { MedicalProfileService } from './medical-profile.service.js';
import {
  CreateImmunizationRecordDto,
  BatchRecordImmunizationDto,
  VaccineType,
  ImmunizationStatus,
} from '../dto/immunization.dto.js';
import { randomUUID } from 'crypto';

export const MANDATORY_SCHOOL_VACCINES: Array<{ type: VaccineType; name: string; requiredDoses: number }> = [
  { type: VaccineType.BCG, name: 'BCG (Tuberculosis)', requiredDoses: 1 },
  { type: VaccineType.OPV, name: 'OPV (Oral Polio Vaccine)', requiredDoses: 3 },
  { type: VaccineType.PENTAVALENT, name: 'Pentavalent (DTP-HepB-Hib)', requiredDoses: 3 },
  { type: VaccineType.MEASLES, name: 'Measles Vaccine', requiredDoses: 1 },
  { type: VaccineType.YELLOW_FEVER, name: 'Yellow Fever Vaccine', requiredDoses: 1 },
  { type: VaccineType.TETANUS_TOXOID, name: 'Tetanus Toxoid', requiredDoses: 1 },
];

@Injectable()
export class ImmunizationService {
  private readonly logger = new Logger(ImmunizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalProfileService: MedicalProfileService,
  ) {}

  async recordImmunization(
    tenantId: string,
    studentId: string,
    dto: CreateImmunizationRecordDto,
  ) {
    const profile = await this.medicalProfileService.getMedicalProfile(tenantId, studentId);
    const existing = profile.immunizations || [];

    const record = {
      id: `imz_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
      ...dto,
      createdAt: new Date(),
    };

    const updatedList = [...existing, record];
    await this.medicalProfileService.upsertMedicalProfile(tenantId, studentId, {
      ...profile,
      immunizations: updatedList,
    });

    return record;
  }

  async getImmunizationHistory(tenantId: string, studentId: string) {
    const profile = await this.medicalProfileService.getMedicalProfile(tenantId, studentId);
    return {
      studentId,
      studentName: profile.student.fullName,
      totalVaccinesAdministered: (profile.immunizations || []).length,
      records: profile.immunizations || [],
    };
  }

  async batchRecordImmunization(tenantId: string, dto: BatchRecordImmunizationDto) {
    let successCount = 0;
    const errors: Array<{ studentId: string; error: string }> = [];

    for (const studentId of dto.studentIds) {
      try {
        await this.recordImmunization(tenantId, studentId, dto.immunizationData);
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
      vaccineAdministered: dto.immunizationData.vaccineName,
      batchDate: dto.immunizationData.dateAdministered,
    };
  }

  async checkImmunizationCompliance(tenantId: string, studentId: string) {
    const profile = await this.medicalProfileService.getMedicalProfile(tenantId, studentId);
    const records = profile.immunizations || [];

    const vaccineMap = new Map<VaccineType, number>();
    for (const r of records) {
      if (r.status === ImmunizationStatus.ADMINISTERED || r.status === ImmunizationStatus.EXEMPTED) {
        vaccineMap.set(r.vaccineType, (vaccineMap.get(r.vaccineType) || 0) + 1);
      }
    }

    const complianceList = MANDATORY_SCHOOL_VACCINES.map((req) => {
      const dosesReceived = vaccineMap.get(req.type) || 0;
      const isComplete = dosesReceived >= req.requiredDoses;

      return {
        vaccineType: req.type,
        vaccineName: req.name,
        requiredDoses: req.requiredDoses,
        dosesReceived,
        isCompliant: isComplete,
        status: isComplete ? 'COMPLIANT' : 'NON_COMPLIANT',
      };
    });

    const isFullyCompliant = complianceList.every((c) => c.isCompliant);
    const nonCompliantCount = complianceList.filter((c) => !c.isCompliant).length;

    return {
      studentId,
      studentName: profile.student.fullName,
      isFullyCompliant,
      nonCompliantCount,
      compliancePercentage: Number(
        (((MANDATORY_SCHOOL_VACCINES.length - nonCompliantCount) / MANDATORY_SCHOOL_VACCINES.length) * 100).toFixed(1),
      ),
      evaluation: complianceList,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
