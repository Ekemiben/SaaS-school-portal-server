import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { MedicalProfileService } from './medical-profile.service.js';
import {
  CreateImmunizationRecordDto,
  BatchRecordImmunizationDto,
  VaccineType,
  ImmunizationStatus,
} from '../dto/immunization.dto.js';
import { BloodGroup, Genotype } from '../dto/medical-profile.dto.js';
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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const record = await this.prisma.immunizationRecord.create({
      data: {
        id: `imz_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
        tenantId,
        studentId,
        vaccineType: dto.vaccineType,
        vaccineName: dto.vaccineName,
        requiredDoses: (dto as any).requiredDoses || 1,
        doseNumber: dto.doseNumber || 1,
        dateAdministered: new Date(dto.dateAdministered),
        administeredBy: dto.administeredByStaffName || dto.administeredByClinic || (dto as any).administeredBy || null,
        batchNumber: dto.batchNumber || null,
        status: dto.status || ImmunizationStatus.ADMINISTERED,
        documentFileId: (dto as any).documentFileId || null,
        notes: dto.notes || null,
      },
    });

    // Synchronize to MedicalProfile for consolidated view
    try {
      const profile = await this.medicalProfileService.getMedicalProfile(tenantId, studentId);
      const existing = (profile.immunizations as any[]) || [];
      await this.medicalProfileService.upsertMedicalProfile(tenantId, studentId, {
        studentId,
        bloodGroup: (profile.bloodGroup as BloodGroup) || BloodGroup.UNKNOWN,
        genotype: (profile.genotype as Genotype) || Genotype.UNKNOWN,
        vitals: profile.vitals as any,
        emergencyContact: profile.emergencyContact as any,
        chronicConditions: (profile.chronicConditions as any) || [],
        allergies: (profile.allergies as any) || [],
        immunizations: [...existing, record] as any,
        hmoProvider: profile.hmoProvider || undefined,
        hmoPolicyNumber: profile.hmoPolicyNumber || undefined,
        dietaryRestrictions: profile.dietaryRestrictions || undefined,
        specialCareNotes: profile.specialCareNotes || undefined,
      });
    } catch (err: any) {
      this.logger.warn(`Could not sync immunization record to profile: ${err.message}`);
    }

    return record;
  }

  async getImmunizationHistory(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const records = await this.prisma.immunizationRecord.findMany({
      where: { tenantId, studentId },
      orderBy: { dateAdministered: 'desc' },
    });

    return {
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      totalVaccinesAdministered: records.length,
      records,
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
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException('Student record not found');
    }

    const records = await this.prisma.immunizationRecord.findMany({
      where: { tenantId, studentId },
    });

    const vaccineMap = new Map<VaccineType, number>();
    for (const r of records) {
      if (r.status === ImmunizationStatus.ADMINISTERED || r.status === ImmunizationStatus.EXEMPTED) {
        vaccineMap.set(r.vaccineType as VaccineType, (vaccineMap.get(r.vaccineType as VaccineType) || 0) + 1);
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
      studentName: `${student.firstName} ${student.lastName}`,
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
