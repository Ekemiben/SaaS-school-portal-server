import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { FilesModule } from '../files/files.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { FeesModule } from '../fees/fees.module.js';

import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsPublicController } from './admissions-public.controller.js';
import { AdmissionsAdminController } from './admissions-admin.controller.js';

import { AdmissionInquiryService } from './services/admission-inquiry.service.js';
import { AdmissionApplicationService } from './services/admission-application.service.js';
import { AdmissionScreeningService } from './services/admission-screening.service.js';
import { AdmissionInterviewService } from './services/admission-interview.service.js';
import { AdmissionOfferService } from './services/admission-offer.service.js';
import { AdmissionDocumentService } from './services/admission-document.service.js';
import { AdmissionLetterRendererService } from './services/admission-letter-renderer.service.js';

@Module({
  imports: [PrismaModule, FilesModule, PaymentsModule, FeesModule],
  controllers: [AdmissionsController, AdmissionsPublicController, AdmissionsAdminController],
  providers: [
    AdmissionInquiryService,
    AdmissionApplicationService,
    AdmissionScreeningService,
    AdmissionInterviewService,
    AdmissionOfferService,
    AdmissionDocumentService,
    AdmissionLetterRendererService,
  ],
  exports: [
    AdmissionInquiryService,
    AdmissionApplicationService,
    AdmissionScreeningService,
    AdmissionInterviewService,
    AdmissionOfferService,
    AdmissionDocumentService,
    AdmissionLetterRendererService,
  ],
})
export class AdmissionsModule {}
