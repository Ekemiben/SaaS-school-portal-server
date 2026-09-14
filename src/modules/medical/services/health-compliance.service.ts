import { Injectable, Logger } from '@nestjs/common';
import { MedicalPolicyService } from './medical-policy.service.js';
import { FitnessCertificateService } from './fitness-certificate.service.js';
import { HealthScreeningService } from './health-screening.service.js';
import { ImmunizationService } from './immunization.service.js';
import {
  ActivityContext,
  ContextualComplianceStatus,
  PolicyRequirementLevel,
  CheckActivityEligibilityDto,
} from '../dto/health-policy.dto.js';
import { CertificateType, FitnessStatus } from '../dto/fitness-certificate.dto.js';

export interface ActivityEligibilityResponse {
  studentId: string;
  activityContext: ActivityContext;
  isEligible: boolean;
  status: ContextualComplianceStatus;
  generalPlatformAccess: 'ALLOWED';
  restrictions: string[];
  reason: string;
  evaluatedAt: string;
}

@Injectable()
export class HealthComplianceService {
  private readonly logger = new Logger(HealthComplianceService.name);

  constructor(
    private readonly policyService: MedicalPolicyService,
    private readonly certificateService: FitnessCertificateService,
    private readonly screeningService: HealthScreeningService,
    private readonly immunizationService: ImmunizationService,
  ) {}

  async checkActivityEligibility(
    tenantId: string,
    dto: CheckActivityEligibilityDto,
  ): Promise<ActivityEligibilityResponse> {
    const timestamp = new Date().toISOString();

    // General academic access is unconditionally allowed
    if (dto.activityContext === ActivityContext.GENERAL_ACADEMICS) {
      return {
        studentId: dto.studentId,
        activityContext: dto.activityContext,
        isEligible: true,
        status: ContextualComplianceStatus.CLEARED,
        generalPlatformAccess: 'ALLOWED',
        restrictions: [],
        reason: 'General platform and academic access is unconditionally permitted.',
        evaluatedAt: timestamp,
      };
    }

    const policy = await this.policyService.getPolicy(tenantId);
    let requirement = PolicyRequirementLevel.OPTIONAL;

    if (dto.activityContext === ActivityContext.SPORTS_ATHLETICS) {
      requirement = policy.sportsClearance;
    } else if (dto.activityContext === ActivityContext.HOSTEL_BOARDING) {
      requirement = policy.hostelClearance;
    } else if (dto.activityContext === ActivityContext.ADMISSION_CLEARANCE) {
      requirement = policy.admissionClearance;
    }

    if (
      requirement === PolicyRequirementLevel.DISABLED ||
      requirement === PolicyRequirementLevel.NOT_APPLICABLE
    ) {
      return {
        studentId: dto.studentId,
        activityContext: dto.activityContext,
        isEligible: true,
        status: ContextualComplianceStatus.NOT_APPLICABLE,
        generalPlatformAccess: 'ALLOWED',
        restrictions: [],
        reason: 'Medical clearance is not required or applicable for this activity.',
        evaluatedAt: timestamp,
      };
    }

    const certType =
      dto.activityContext === ActivityContext.SPORTS_ATHLETICS
        ? CertificateType.SPORTS_ATHLETICS
        : dto.activityContext === ActivityContext.HOSTEL_BOARDING
        ? CertificateType.HOSTEL_BOARDING
        : CertificateType.GENERAL_FITNESS;

    const cert = await this.certificateService.getLatestActiveCertificate(
      tenantId,
      dto.studentId,
      certType,
    );

    if (!cert) {
      if (requirement === PolicyRequirementLevel.REQUIRED) {
        return {
          studentId: dto.studentId,
          activityContext: dto.activityContext,
          isEligible: false,
          status: ContextualComplianceStatus.PENDING_REVIEW,
          generalPlatformAccess: 'ALLOWED',
          restrictions: [],
          reason: 'Valid medical clearance certificate required before participating in this activity.',
          evaluatedAt: timestamp,
        };
      }
      return {
        studentId: dto.studentId,
        activityContext: dto.activityContext,
        isEligible: true,
        status: ContextualComplianceStatus.NOT_REQUIRED,
        generalPlatformAccess: 'ALLOWED',
        restrictions: [],
        reason: 'Medical clearance is optional and not currently submitted.',
        evaluatedAt: timestamp,
      };
    }

    if (
      cert.fitnessStatus === FitnessStatus.TEMPORARILY_UNFIT ||
      cert.fitnessStatus === FitnessStatus.PERMANENTLY_UNFIT_FOR_ACTIVITY
    ) {
      return {
        studentId: dto.studentId,
        activityContext: dto.activityContext,
        isEligible: false,
        status: ContextualComplianceStatus.ACTIVITY_RESTRICTED,
        generalPlatformAccess: 'ALLOWED',
        restrictions: cert.activityRestrictions,
        reason: 'Medical professional documented activity-specific restriction.',
        evaluatedAt: timestamp,
      };
    }

    if (cert.fitnessStatus === FitnessStatus.FIT_WITH_RESTRICTIONS) {
      return {
        studentId: dto.studentId,
        activityContext: dto.activityContext,
        isEligible: true,
        status: ContextualComplianceStatus.CLEARED_WITH_RESTRICTIONS,
        generalPlatformAccess: 'ALLOWED',
        restrictions: cert.activityRestrictions,
        reason: 'Cleared with documented clinical accommodations and activity restrictions.',
        evaluatedAt: timestamp,
      };
    }

    return {
      studentId: dto.studentId,
      activityContext: dto.activityContext,
      isEligible: true,
      status: ContextualComplianceStatus.CLEARED,
      generalPlatformAccess: 'ALLOWED',
      restrictions: [],
      reason: 'Unconditionally cleared for this activity.',
      evaluatedAt: timestamp,
    };
  }

  async getStudentComplianceSummary(tenantId: string, studentId: string) {
    const [sports, hostel, academics] = await Promise.all([
      this.checkActivityEligibility(tenantId, {
        studentId,
        activityContext: ActivityContext.SPORTS_ATHLETICS,
      }),
      this.checkActivityEligibility(tenantId, {
        studentId,
        activityContext: ActivityContext.HOSTEL_BOARDING,
      }),
      this.checkActivityEligibility(tenantId, {
        studentId,
        activityContext: ActivityContext.GENERAL_ACADEMICS,
      }),
    ]);

    let immunizationCompliance: any = null;
    try {
      immunizationCompliance = await this.immunizationService.checkImmunizationCompliance(
        tenantId,
        studentId,
      );
    } catch {
      immunizationCompliance = { status: 'NOT_ASSESSED', isFullyCompliant: false };
    }

    const screenings = await this.screeningService.getScreenings(tenantId, { studentId });

    return {
      studentId,
      generalPlatformAccess: 'ALLOWED',
      activityClearance: {
        sports,
        hostel,
        academics,
      },
      immunization: immunizationCompliance,
      screeningsCount: screenings.length,
      screenings: screenings.slice(0, 5),
      evaluatedAt: new Date().toISOString(),
    };
  }

  async getInstitutionalComplianceAudit(tenantId: string) {
    const policy = await this.policyService.getPolicy(tenantId);
    const certificates = await this.certificateService.getCertificates(tenantId);
    const followUps = await this.screeningService.getPendingFollowUps(tenantId);

    return {
      tenantId,
      schoolPolicy: policy,
      totalCertificatesIssued: certificates.length,
      activeCertificatesCount: certificates.filter((c) => !c.isRevoked).length,
      pendingClinicalFollowUps: followUps.length,
      generalPlatformAccessRule: 'Unrestricted for all users regardless of medical status',
      auditedAt: new Date().toISOString(),
    };
  }
}
