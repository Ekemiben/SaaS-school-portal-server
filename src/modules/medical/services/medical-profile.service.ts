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
  private readonly profiles = new Map<string, any>(); // key: `${tenantId}:${studentId}`

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
  ) {}

  private profileKey(tenantId: string, studentId: string): string {
    return `${tenantId}:${studentId}`;
  }

  async getMedicalProfile(tenantId: string, studentId: string) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student not found');
    }

    const key = this.profileKey(tenantId, studentId);
    let profile = this.profiles.get(key);

    if (!profile) {
      // Return empty default profile structure
      profile = {
        id: `med_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        tenantId,
        studentId,
        bloodGroup: BloodGroup.UNKNOWN,
        genotype: Genotype.UNKNOWN,
        vitals: null,
        emergencyContact: null,
        chronicConditions: [],
        allergies: [],
        immunizations: [],
        hmoProvider: null,
        hmoPolicyNumber: null,
        dietaryRestrictions: null,
        specialCareNotes: null,
        documents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.profiles.set(key, profile);
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
        classId: student.currentClassId || student.classId,
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
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException('Student not found');
    }

    const key = this.profileKey(tenantId, studentId);
    const existing = this.profiles.get(key);

    // Calculate BMI if height and weight are provided
    let vitals = dto.vitals || existing?.vitals;
    if (vitals?.heightCm && vitals?.weightKg) {
      const heightM = vitals.heightCm / 100;
      const bmi = Number((vitals.weightKg / (heightM * heightM)).toFixed(1));
      vitals = { ...vitals, bmi, recordedAt: vitals.recordedAt || new Date().toISOString() };
    }

    const profileData = {
      id: existing?.id || `med_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
      tenantId,
      studentId,
      bloodGroup: dto.bloodGroup || existing?.bloodGroup || BloodGroup.UNKNOWN,
      genotype: dto.genotype || existing?.genotype || Genotype.UNKNOWN,
      vitals: vitals || null,
      emergencyContact: dto.emergencyContact || existing?.emergencyContact || null,
      chronicConditions: dto.chronicConditions ?? existing?.chronicConditions ?? [],
      allergies: dto.allergies ?? existing?.allergies ?? [],
      immunizations: dto.immunizations ?? existing?.immunizations ?? [],
      hmoProvider: dto.hmoProvider ?? existing?.hmoProvider ?? null,
      hmoPolicyNumber: dto.hmoPolicyNumber ?? existing?.hmoPolicyNumber ?? null,
      dietaryRestrictions: dto.dietaryRestrictions ?? existing?.dietaryRestrictions ?? null,
      specialCareNotes: dto.specialCareNotes ?? existing?.specialCareNotes ?? null,
      documents: existing?.documents || [],
      lastUpdatedByUserId: updatedByUserId,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    this.profiles.set(key, profileData);
    return this.getMedicalProfile(tenantId, studentId);
  }

  async addAllergy(tenantId: string, studentId: string, dto: CreateAllergyDto) {
    const profile = await this.getMedicalProfile(tenantId, studentId);
    const existingAllergies = profile.allergies || [];

    // Filter duplicate allergen
    const filtered = existingAllergies.filter(
      (a: any) => a.allergen.toLowerCase() !== dto.allergen.toLowerCase(),
    );
    filtered.push(dto);

    return this.upsertMedicalProfile(tenantId, studentId, {
      ...profile,
      allergies: filtered,
    });
  }

  async removeAllergy(tenantId: string, studentId: string, allergen: string) {
    const profile = await this.getMedicalProfile(tenantId, studentId);
    const filtered = (profile.allergies || []).filter(
      (a: any) => a.allergen.toLowerCase() !== allergen.toLowerCase(),
    );

    return this.upsertMedicalProfile(tenantId, studentId, {
      ...profile,
      allergies: filtered,
    });
  }

  async getEmergencyActionPlan(tenantId: string, studentId: string) {
    const profile = await this.getMedicalProfile(tenantId, studentId);
    const studentClass = profile.student.classId
      ? this.prisma.memoryStore.classes.get(profile.student.classId)
      : null;

    const criticalAllergies = (profile.allergies || []).filter(
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
    const studentsInClass = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) =>
        s.tenantId === tenantId &&
        (s.currentClassId === classId || s.classId === classId) &&
        s.status === 'ACTIVE',
    );

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
          allergiesCount: profile.allergies?.length || 0,
          chronicConditions: profile.chronicConditions?.map((c: any) => c.conditionName) || [],
          emergencyPhone: profile.emergencyContact?.primaryPhone || 'N/A',
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
    for (const allergy of profile.allergies || []) {
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
    for (const cond of profile.chronicConditions || []) {
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
