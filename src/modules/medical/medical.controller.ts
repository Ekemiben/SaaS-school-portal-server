import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { MedicalProfileService } from './services/medical-profile.service.js';
import { ImmunizationService } from './services/immunization.service.js';
import { ClinicService } from './services/clinic.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  CreateMedicalProfileDto,
  UpdateMedicalProfileDto,
} from './dto/medical-profile.dto.js';
import { CreateAllergyDto } from './dto/allergy.dto.js';
import {
  CreateImmunizationRecordDto,
  BatchRecordImmunizationDto,
} from './dto/immunization.dto.js';
import {
  CreateClinicVisitDto,
  DischargePatientDto,
  ClinicVisitFilterDto,
} from './dto/clinic-visit.dto.js';
import { RecordMedicationDispensationDto } from './dto/dispensation.dto.js';
import {
  CreateHealthIncidentDto,
  HealthIncidentFilterDto,
} from './dto/incident.dto.js';

@Controller('api/v1/medical')
export class MedicalController {
  constructor(
    private readonly medicalProfileService: MedicalProfileService,
    private readonly immunizationService: ImmunizationService,
    private readonly clinicService: ClinicService,
  ) {}

  // --- Student Medical Profiles ---
  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('students/:studentId')
  async getMedicalProfile(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string) {
    return this.medicalProfileService.getMedicalProfile(tenant.tenantId, studentId);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Put('students/:studentId')
  async updateMedicalProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateMedicalProfileDto,
  ) {
    return this.medicalProfileService.upsertMedicalProfile(tenant.tenantId, studentId, dto, user?.id);
  }

  // --- Allergies ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('students/:studentId/allergies')
  async addAllergy(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string, @Body() dto: CreateAllergyDto) {
    return this.medicalProfileService.addAllergy(tenant.tenantId, studentId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Delete('students/:studentId/allergies/:allergen')
  async removeAllergy(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string, @Param('allergen') allergen: string) {
    return this.medicalProfileService.removeAllergy(tenant.tenantId, studentId, allergen);
  }

  // --- Immunizations ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('students/:studentId/immunizations')
  async recordImmunization(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string, @Body() dto: CreateImmunizationRecordDto) {
    return this.immunizationService.recordImmunization(tenant.tenantId, studentId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('students/:studentId/immunizations')
  async getImmunizationHistory(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string) {
    return this.immunizationService.getImmunizationHistory(tenant.tenantId, studentId);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('students/:studentId/immunization-compliance')
  async checkImmunizationCompliance(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string) {
    return this.immunizationService.checkImmunizationCompliance(tenant.tenantId, studentId);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('immunizations/batch')
  async batchRecordImmunization(@CurrentTenant() tenant: TenantContext, @Body() dto: BatchRecordImmunizationDto) {
    return this.immunizationService.batchRecordImmunization(tenant.tenantId, dto);
  }

  // --- Emergency Action Plan (EAP) & Alerts ---
  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('students/:studentId/emergency-plan')
  async getEmergencyActionPlan(@CurrentTenant() tenant: TenantContext, @Param('studentId') studentId: string) {
    return this.medicalProfileService.getEmergencyActionPlan(tenant.tenantId, studentId);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('classes/:classId/alerts')
  async getClassMedicalAlertRoster(@CurrentTenant() tenant: TenantContext, @Param('classId') classId: string) {
    return this.medicalProfileService.getClassMedicalAlertRoster(tenant.tenantId, classId);
  }

  // --- Clinic Visits & Consultations ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('clinic/visits')
  async recordClinicVisit(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: any, @Body() dto: CreateClinicVisitDto) {
    return this.clinicService.recordClinicVisit(tenant.tenantId, dto, user?.id);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('clinic/visits/:id/discharge')
  async dischargePatient(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: DischargePatientDto) {
    return this.clinicService.dischargePatient(tenant.tenantId, id, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('clinic/visits')
  async listClinicVisits(@CurrentTenant() tenant: TenantContext, @Query() query: ClinicVisitFilterDto) {
    return this.clinicService.listClinicVisits(tenant.tenantId, query);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('clinic/visits/:id')
  async getClinicVisit(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.clinicService.getClinicVisit(tenant.tenantId, id);
  }

  // --- Medication Dispensation ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('clinic/dispensations')
  async recordMedicationDispensation(@CurrentTenant() tenant: TenantContext, @Body() dto: RecordMedicationDispensationDto) {
    return this.clinicService.recordMedicationDispensation(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('clinic/dispensations')
  async listMedicationDispensations(@CurrentTenant() tenant: TenantContext, @Query('studentId') studentId?: string) {
    return this.clinicService.listMedicationDispensations(tenant.tenantId, studentId);
  }

  // --- First Aid & Incident Logging ---
  @RequirePermissions(SystemPermissions.MEDICAL_MANAGE)
  @Post('clinic/incidents')
  async logHealthIncident(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: any, @Body() dto: CreateHealthIncidentDto) {
    return this.clinicService.logHealthIncident(tenant.tenantId, dto, user?.id);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('clinic/incidents')
  async listHealthIncidents(@CurrentTenant() tenant: TenantContext, @Query() query: HealthIncidentFilterDto) {
    return this.clinicService.listHealthIncidents(tenant.tenantId, query);
  }

  @RequirePermissions(SystemPermissions.MEDICAL_VIEW)
  @Get('clinic/analytics')
  async getClinicAnalytics(@CurrentTenant() tenant: TenantContext) {
    return this.clinicService.getClinicAnalytics(tenant.tenantId);
  }
}
