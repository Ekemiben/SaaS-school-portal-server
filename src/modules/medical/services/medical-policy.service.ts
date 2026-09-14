import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  PolicyRequirementLevel,
  UpdateSchoolMedicalPolicyDto,
} from '../dto/health-policy.dto.js';

export interface SchoolMedicalPolicy {
  tenantId: string;
  sportsClearance: PolicyRequirementLevel;
  hostelClearance: PolicyRequirementLevel;
  admissionClearance: PolicyRequirementLevel;
  annualScreening: PolicyRequirementLevel;
  immunizationTracking: PolicyRequirementLevel;
  updatedAt: string;
}

@Injectable()
export class MedicalPolicyService {
  private readonly logger = new Logger(MedicalPolicyService.name);
  private readonly fallbackPolicies = new Map<string, SchoolMedicalPolicy>();

  constructor(private readonly prisma: PrismaService) {}

  private getDefaultPolicy(tenantId: string): SchoolMedicalPolicy {
    return {
      tenantId,
      sportsClearance: PolicyRequirementLevel.OPTIONAL,
      hostelClearance: PolicyRequirementLevel.OPTIONAL,
      admissionClearance: PolicyRequirementLevel.OPTIONAL,
      annualScreening: PolicyRequirementLevel.OPTIONAL,
      immunizationTracking: PolicyRequirementLevel.OPTIONAL,
      updatedAt: new Date().toISOString(),
    };
  }

  async getPolicy(tenantId: string): Promise<SchoolMedicalPolicy> {
    try {
      const setting = await (this.prisma as any).setting?.findFirst({
        where: { tenantId, key: 'MEDICAL_POLICY' },
      });
      if (setting && setting.value) {
        const parsed = JSON.parse(setting.value);
        return {
          tenantId,
          sportsClearance: parsed.sportsClearance || PolicyRequirementLevel.OPTIONAL,
          hostelClearance: parsed.hostelClearance || PolicyRequirementLevel.OPTIONAL,
          admissionClearance: parsed.admissionClearance || PolicyRequirementLevel.OPTIONAL,
          annualScreening: parsed.annualScreening || PolicyRequirementLevel.OPTIONAL,
          immunizationTracking: parsed.immunizationTracking || PolicyRequirementLevel.OPTIONAL,
          updatedAt: setting.updatedAt ? new Date(setting.updatedAt).toISOString() : new Date().toISOString(),
        };
      }
    } catch {
      // fallback
    }

    const cached = this.fallbackPolicies.get(tenantId);
    if (cached) return cached;

    const defaultPolicy = this.getDefaultPolicy(tenantId);
    this.fallbackPolicies.set(tenantId, defaultPolicy);
    return defaultPolicy;
  }

  async updatePolicy(
    tenantId: string,
    dto: UpdateSchoolMedicalPolicyDto,
  ): Promise<SchoolMedicalPolicy> {
    const current = await this.getPolicy(tenantId);
    const updated: SchoolMedicalPolicy = {
      tenantId,
      sportsClearance: dto.sportsClearance ?? current.sportsClearance,
      hostelClearance: dto.hostelClearance ?? current.hostelClearance,
      admissionClearance: dto.admissionClearance ?? current.admissionClearance,
      annualScreening: dto.annualScreening ?? current.annualScreening,
      immunizationTracking: dto.immunizationTracking ?? current.immunizationTracking,
      updatedAt: new Date().toISOString(),
    };

    try {
      await (this.prisma as any).setting?.upsert({
        where: {
          tenantId_key: { tenantId, key: 'MEDICAL_POLICY' },
        },
        update: {
          value: JSON.stringify(updated),
        },
        create: {
          tenantId,
          key: 'MEDICAL_POLICY',
          value: JSON.stringify(updated),
        },
      });
    } catch {
      // fallback
    }

    this.fallbackPolicies.set(tenantId, updated);
    this.logger.log(`Updated health policy for tenant ${tenantId}`);
    return updated;
  }
}
