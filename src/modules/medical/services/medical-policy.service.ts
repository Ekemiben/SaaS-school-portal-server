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
    const defaultPolicy = this.getDefaultPolicy(tenantId);
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { features: true },
      });

      const features = (tenant?.features as Record<string, any>) || {};
      if (features.medicalPolicy) {
        return {
          ...defaultPolicy,
          ...features.medicalPolicy,
          tenantId,
        };
      }
    } catch (err: any) {
      this.logger.warn(`Could not load medical policy for tenant ${tenantId}: ${err.message}`);
    }

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
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { features: true },
      });

      const features = (tenant?.features as Record<string, any>) || {};
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          features: {
            ...features,
            medicalPolicy: updated,
          } as any,
        },
      });
      this.logger.log(`Persisted medical policy to Tenant.features for tenant ${tenantId}`);
    } catch (err: any) {
      this.logger.error(`Could not persist medical policy for tenant ${tenantId}: ${err.message}`);
    }

    return updated;
  }
}
