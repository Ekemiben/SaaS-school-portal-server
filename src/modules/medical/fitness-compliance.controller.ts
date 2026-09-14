import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { MedicalPolicyService } from './services/medical-policy.service.js';
import { FitnessCertificateService } from './services/fitness-certificate.service.js';
import { HealthScreeningService } from './services/health-screening.service.js';
import { HealthComplianceService } from './services/health-compliance.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  UpdateSchoolMedicalPolicyDto,
  CheckActivityEligibilityDto,
} from './dto/health-policy.dto.js';
import {
  CreateFitnessCertificateDto,
  FitnessCertificateFilterDto,
} from './dto/fitness-certificate.dto.js';
import {
  RecordHealthScreeningDto,
  BatchScreeningDto,
  HealthScreeningFilterDto,
} from './dto/health-screening.dto.js';

@Controller('api/v1/medical')
export class FitnessComplianceController {
  constructor(
    private readonly policyService: MedicalPolicyService,
    private readonly certificateService: FitnessCertificateService,
    private readonly screeningService: HealthScreeningService,
    private readonly complianceService: HealthComplianceService,
  ) {}

  // --- Health Policies ---
  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('policy')
  async getPolicy(@CurrentTenant() tenant: TenantContext) {
    return this.policyService.getPolicy(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Put('policy')
  async updatePolicy(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: UpdateSchoolMedicalPolicyDto,
  ) {
    return this.policyService.updatePolicy(tenant.tenantId, dto);
  }

  // --- Medical Fitness Certificates ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('certificates')
  async issueCertificate(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateFitnessCertificateDto,
  ) {
    return this.certificateService.issueCertificate(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('certificates')
  async listCertificates(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: FitnessCertificateFilterDto,
  ) {
    return this.certificateService.getCertificates(tenant.tenantId, filter);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('certificates/:id')
  async getCertificate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.certificateService.getCertificateById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('certificates/verify/:code')
  async verifyCertificate(
    @CurrentTenant() tenant: TenantContext,
    @Param('code') code: string,
  ) {
    return this.certificateService.verifyCertificatePublic(tenant.tenantId, code);
  }

  // --- Health Screening Campaigns ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('screenings')
  async recordScreening(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: RecordHealthScreeningDto,
  ) {
    return this.screeningService.recordScreening(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('screenings/batch')
  async batchRecordScreening(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: BatchScreeningDto,
  ) {
    return this.screeningService.batchRecordScreening(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('screenings')
  async listScreenings(
    @CurrentTenant() tenant: TenantContext,
    @Query() filter: HealthScreeningFilterDto,
  ) {
    return this.screeningService.getScreenings(tenant.tenantId, filter);
  }

  // --- Contextual Activity Eligibility & Institutional Audit ---
  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Post('eligibility/check')
  async checkEligibility(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CheckActivityEligibilityDto,
  ) {
    return this.complianceService.checkActivityEligibility(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('compliance/student/:studentId')
  async getStudentCompliance(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
  ) {
    return this.complianceService.getStudentComplianceSummary(tenant.tenantId, studentId);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('compliance/audit')
  async getInstitutionalAudit(@CurrentTenant() tenant: TenantContext) {
    return this.complianceService.getInstitutionalComplianceAudit(tenant.tenantId);
  }
}
