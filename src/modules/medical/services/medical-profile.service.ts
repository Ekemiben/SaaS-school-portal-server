import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../../files/storage.provider.js';
import {
  CreateMedicalProfileDto,
  UpdateMedicalProfileDto,
  BloodGroup,
  Genotype,
} from '../dto/medical-profile.dto.js';
import { CreateAllergyDto, AllergySeverity } from '../dto/allergy.dto.js';
import { randomUUID } from 'crypto';

export interface MedicalAlertBadge {
  type: 'CRITICAL_ALLERGY' | 'CHRONIC_CONDITION' | 'DIETARY' | 'SPECIAL_CARE';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  actionProtocol: string;
}

@Injectable()
export class MedicalProfileService {
  private readonly logger = new Logger(MedicalProfileService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
  ) {}

  async getMedicalProfile(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    let profile = await this.prisma.medicalProfile.findFirst({
      where: { studentId, tenantId },
    });

    if (!profile) {
      // Default to student baseline medical fields if available
      const bloodGroup = (student.bloodGroup as any) || BloodGroup.UNKNOWN;
      const genotype = (student.genotype as any) || Genotype.UNKNOWN;
      const emergencyContact = student.emergencyContactName
        ? {
            primaryContactName: student.emergencyContactName,
            relationship: student.emergencyContactRelationship || 'Parent/Guardian',
            primaryPhone: student.emergencyContactPhone || '',
          }
        : null;
      const chronicConditions = student.medicalConditions
        ? [
            {
              conditionName: student.medicalConditions,
              severity: 'MEDIUM',
              managementProtocol: 'Follow registered physician guidance',
            },
          ]
        : [];
      const allergies = student.allergies
        ? [
            {
              allergen: student.allergies,
              severity: AllergySeverity.MODERATE,
              reactionSymptoms: 'Allergic reaction reported',
              emergencyTreatment: 'Administer prescribed antihistamine and alert school nurse',
            },
          ]
        : [];

      profile = await this.prisma.medicalProfile.create({
        data: {
          id: `med_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
          tenantId,
          studentId,
          bloodGroup,
          genotype,
          vitals: undefined,
          emergencyContact: emergencyContact ? (emergencyContact as any) : undefined,
          chronicConditions: (chronicConditions as any) || [],
          allergies: (allergies as any) || [],
          immunizations: [],
          hmoProvider: null,
          hmoPolicyNumber: null,
          dietaryRestrictions: null,
          specialCareNotes: null,
          documents: [],
        },
      });
    }

    const alerts = this.evaluateMedicalAlerts(profile);

    return {
      ...profile,
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
        classId: student.enrollments[0]?.classId || null,
      },
      alerts,
      hasCriticalAlerts: alerts.some((a) => a.severity === 'HIGH'),
    };
  }

  async upsertMedicalProfile(
    tenantId: string,
    studentId: string,
    dto: CreateMedicalProfileDto | UpdateMedicalProfileDto,
    updatedByUserId?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const existing = await this.prisma.medicalProfile.findFirst({
      where: { studentId, tenantId },
    });

    // Calculate BMI if height and weight are provided
    let vitals = dto.vitals || (existing?.vitals as any);
    if (vitals?.heightCm && vitals?.weightKg) {
      const heightM = vitals.heightCm / 100;
      const bmi = Number((vitals.weightKg / (heightM * heightM)).toFixed(1));
      vitals = { ...vitals, bmi, recordedAt: vitals.recordedAt || new Date().toISOString() };
    }

    const profile = await this.prisma.medicalProfile.upsert({
      where: { studentId },
      create: {
        id: `med_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        tenantId,
        studentId,
        bloodGroup: dto.bloodGroup || student.bloodGroup || BloodGroup.UNKNOWN,
        genotype: dto.genotype || student.genotype || Genotype.UNKNOWN,
        vitals: vitals ? (vitals as any) : undefined,
        emergencyContact: dto.emergencyContact ? (dto.emergencyContact as any) : undefined,
        chronicConditions: (dto.chronicConditions as any) || [],
        allergies: (dto.allergies as any) || [],
        immunizations: (dto.immunizations as any) || [],
        hmoProvider: dto.hmoProvider || null,
        hmoPolicyNumber: dto.hmoPolicyNumber || null,
        dietaryRestrictions: dto.dietaryRestrictions || null,
        specialCareNotes: dto.specialCareNotes || null,
        documents: [],
        lastUpdatedByUserId: updatedByUserId,
      },
      update: {
        bloodGroup: dto.bloodGroup || undefined,
        genotype: dto.genotype || undefined,
        vitals: vitals !== undefined ? (vitals as any) : undefined,
        emergencyContact: dto.emergencyContact !== undefined ? (dto.emergencyContact as any) : undefined,
        chronicConditions: dto.chronicConditions !== undefined ? (dto.chronicConditions as any) : undefined,
        allergies: dto.allergies !== undefined ? (dto.allergies as any) : undefined,
        immunizations: dto.immunizations !== undefined ? (dto.immunizations as any) : undefined,
        hmoProvider: dto.hmoProvider !== undefined ? dto.hmoProvider : undefined,
        hmoPolicyNumber: dto.hmoPolicyNumber !== undefined ? dto.hmoPolicyNumber : undefined,
        dietaryRestrictions: dto.dietaryRestrictions !== undefined ? dto.dietaryRestrictions : undefined,
        specialCareNotes: dto.specialCareNotes !== undefined ? dto.specialCareNotes : undefined,
        lastUpdatedByUserId: updatedByUserId,
      },
    });

    // Synchronize quick lookup fields on student table
    if (profile.bloodGroup || profile.genotype) {
      await this.prisma.student.update({
        where: { id: studentId },
        data: {
          bloodGroup: profile.bloodGroup || undefined,
          genotype: profile.genotype || undefined,
        },
      });
    }

    return this.getMedicalProfile(tenantId, studentId);
  }

  async addAllergy(tenantId: string, studentId: string, dto: CreateAllergyDto) {
    const profile = await this.getMedicalProfile(tenantId, studentId);
    const existingAllergies = (profile.allergies as any[]) || [];

    // Filter duplicate allergen
    const filtered = existingAllergies.filter(
      (a: any) => a.allergen.toLowerCase() !== dto.allergen.toLowerCase(),
    );
    filtered.push(dto);

    return this.upsertMedicalProfile(tenantId, studentId, {
      studentId,
      bloodGroup: (profile.bloodGroup as BloodGroup) || BloodGroup.UNKNOWN,
      genotype: (profile.genotype as Genotype) || Genotype.UNKNOWN,
      vitals: profile.vitals as any,
      emergencyContact: profile.emergencyContact as any,
      chronicConditions: (profile.chronicConditions as any) || [],
      allergies: filtered as any,
      immunizations: (profile.immunizations as any) || [],
      hmoProvider: profile.hmoProvider || undefined,
      hmoPolicyNumber: profile.hmoPolicyNumber || undefined,
      dietaryRestrictions: profile.dietaryRestrictions || undefined,
      specialCareNotes: profile.specialCareNotes || undefined,
    });
  }

  async removeAllergy(tenantId: string, studentId: string, allergen: string) {
    const profile = await this.getMedicalProfile(tenantId, studentId);
    const existingAllergies = (profile.allergies as any[]) || [];
    const filtered = existingAllergies.filter(
      (a: any) => a.allergen.toLowerCase() !== allergen.toLowerCase(),
    );

    return this.upsertMedicalProfile(tenantId, studentId, {
      studentId,
      bloodGroup: (profile.bloodGroup as BloodGroup) || BloodGroup.UNKNOWN,
      genotype: (profile.genotype as Genotype) || Genotype.UNKNOWN,
      vitals: profile.vitals as any,
      emergencyContact: profile.emergencyContact as any,
      chronicConditions: (profile.chronicConditions as any) || [],
      allergies: filtered as any,
      immunizations: (profile.immunizations as any) || [],
      hmoProvider: profile.hmoProvider || undefined,
      hmoPolicyNumber: profile.hmoPolicyNumber || undefined,
      dietaryRestrictions: profile.dietaryRestrictions || undefined,
      specialCareNotes: profile.specialCareNotes || undefined,
    });
  }

  async getEmergencyActionPlan(tenantId: string, studentId: string) {
    const profile = await this.getMedicalProfile(tenantId, studentId);
    const studentClass = profile.student.classId
      ? await this.prisma.class.findFirst({ where: { id: profile.student.classId, tenantId } })
      : null;

    const criticalAllergies = ((profile.allergies as any[]) || []).filter(
      (a: any) => a.severity === AllergySeverity.SEVERE || a.severity === AllergySeverity.LIFE_THREATENING,
    );

    return {
      emergencyPlanId: `EAP-${studentId.toUpperCase().substring(0, 8)}`,
      student: {
        ...profile.student,
        className: studentClass?.name || 'Assigned Class',
        bloodGroup: profile.bloodGroup,
        genotype: profile.genotype,
      },
      emergencyContact: profile.emergencyContact,
      criticalAlerts: profile.alerts,
      criticalAllergies,
      chronicConditions: profile.chronicConditions,
      dietaryRestrictions: profile.dietaryRestrictions,
      generatedAt: new Date().toISOString(),
    };
  }

  async getClassMedicalAlertRoster(tenantId: string, classId: string) {
    const studentsInClass = await this.prisma.student.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        enrollments: {
          some: { classId, status: 'ACTIVE' },
        },
      },
    });

    const roster: any[] = [];
    for (const student of studentsInClass) {
      const profile = await this.getMedicalProfile(tenantId, student.id);
      if (profile.alerts.length > 0 || profile.bloodGroup !== BloodGroup.UNKNOWN) {
        roster.push({
          studentId: student.id,
          fullName: `${student.firstName} ${student.lastName}`,
          admissionNumber: student.admissionNumber,
          bloodGroup: profile.bloodGroup,
          genotype: profile.genotype,
          alerts: profile.alerts,
          allergiesCount: ((profile.allergies as any[]) || []).length,
          chronicConditions: ((profile.chronicConditions as any[]) || []).map((c: any) => c.conditionName),
          emergencyPhone: (profile.emergencyContact as any)?.primaryPhone || 'N/A',
        });
      }
    }

    return {
      tenantId,
      classId,
      totalStudentsWithAlerts: roster.length,
      roster,
    };
  }

  private evaluateMedicalAlerts(profile: any): MedicalAlertBadge[] {
    const alerts: MedicalAlertBadge[] = [];

    // 1. Evaluate Allergies
    for (const allergy of (profile.allergies as any[]) || []) {
      const isHigh =
        allergy.severity === AllergySeverity.LIFE_THREATENING ||
        allergy.severity === AllergySeverity.SEVERE ||
        allergy.isEpiPenRequired;

      alerts.push({
        type: 'CRITICAL_ALLERGY',
        severity: isHigh ? 'HIGH' : 'MEDIUM',
        title: `${allergy.severity} Allergy: ${allergy.allergen}`,
        description: allergy.reactionSymptoms,
        actionProtocol: allergy.emergencyTreatment,
      });
    }

    // 2. Evaluate Chronic Conditions
    for (const cond of (profile.chronicConditions as any[]) || []) {
      const isHigh = cond.severity === 'SEVERE' || cond.requiresClinicEmergencyProtocol;
      alerts.push({
        type: 'CHRONIC_CONDITION',
        severity: isHigh ? 'HIGH' : 'MEDIUM',
        title: `Condition: ${cond.conditionName} (${cond.severity})`,
        description: `Medications: ${(cond.dailyMedications || []).join(', ') || 'None reported'}`,
        actionProtocol: cond.managementProtocol,
      });
    }

    // 3. Dietary
    if (profile.dietaryRestrictions) {
      alerts.push({
        type: 'DIETARY',
        severity: 'LOW',
        title: 'Dietary Restriction',
        description: profile.dietaryRestrictions,
        actionProtocol: 'Avoid prohibited meal ingredients in cafeteria/dining hall',
      });
    }

    return alerts;
  }
}
