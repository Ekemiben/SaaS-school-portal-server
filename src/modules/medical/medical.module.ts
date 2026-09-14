import { Module } from '@nestjs/common';
import { MedicalController } from './medical.controller.js';
import { FitnessComplianceController } from './fitness-compliance.controller.js';
import { MedicalProfileService } from './services/medical-profile.service.js';
import { ImmunizationService } from './services/immunization.service.js';
import { ClinicService } from './services/clinic.service.js';
import { MedicalPolicyService } from './services/medical-policy.service.js';
import { FitnessCertificateService } from './services/fitness-certificate.service.js';
import { HealthScreeningService } from './services/health-screening.service.js';
import { HealthComplianceService } from './services/health-compliance.service.js';
import { FilesModule } from '../files/files.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';

@Module({
  imports: [FilesModule, QueuesModule],
  controllers: [MedicalController, FitnessComplianceController],
  providers: [
    MedicalProfileService,
    ImmunizationService,
    ClinicService,
    MedicalPolicyService,
    FitnessCertificateService,
    HealthScreeningService,
    HealthComplianceService,
  ],
  exports: [
    MedicalProfileService,
    ImmunizationService,
    ClinicService,
    MedicalPolicyService,
    FitnessCertificateService,
    HealthScreeningService,
    HealthComplianceService,
  ],
})
export class MedicalModule {}
