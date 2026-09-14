import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service.js';
import { AdmissionsModule } from '../src/modules/admissions/admissions.module.js';
import { AdmissionApplicationService } from '../src/modules/admissions/services/admission-application.service.js';
import { AdmissionOfferService } from '../src/modules/admissions/services/admission-offer.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { BadRequestException } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

describe('TASK 24: Admissions — Offer Generation, Letter Rendering & Acceptance Fee', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let applicationService: AdmissionApplicationService;
  let offerService: AdmissionOfferService;
  let paymentsService: PaymentsService;

  const tenantAlpha = 'tenant_ofr_alpha';
  const campusMain = 'campus_ofr_main';
  const academicYear2026 = 'ay_2026_2027';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AdmissionsModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    applicationService = moduleRef.get<AdmissionApplicationService>(AdmissionApplicationService);
    offerService = moduleRef.get<AdmissionOfferService>(AdmissionOfferService);
    paymentsService = moduleRef.get<PaymentsService>(PaymentsService);

    prisma.memoryStore.tenants.set(tenantAlpha, {
      id: tenantAlpha,
      name: 'St. Jude International Academy',
      primaryColor: '#047857',
      currency: 'NGN',
    });
    prisma.memoryStore.campuses.set(campusMain, {
      id: campusMain,
      tenantId: tenantAlpha,
      name: 'Victoria Island Campus',
    });
  });

  async function createReadyApp(firstName: string, lastName: string) {
    const app = await applicationService.createApplication(
      tenantAlpha,
      {
        campusId: campusMain,
        academicYearId: academicYear2026,
        gradeLevel: 'Grade 7',
        studentFirstName: firstName,
        studentLastName: lastName,
        dateOfBirth: '2014-06-18',
        gender: 'FEMALE',
        parentFirstName: 'Chief',
        parentLastName: lastName,
        parentEmail: `chief.${lastName.toLowerCase()}@example.ng`,
        parentPhone: '+2348033445566',
      },
      true,
    );

    // Transition to UNDER_REVIEW
    await applicationService.transitionStatus(tenantAlpha, app.id, { status: 'UNDER_REVIEW' });
    return app;
  }

  it('should record formal admission decision and generate formal offer with branded letter', async () => {
    const app = await createReadyApp('Ngozi', 'Eze');

    // 1. Formal Approval Decision
    const decision = await offerService.createDecision(
      tenantAlpha,
      app.id,
      'user_board_chair',
      {
        decision: 'APPROVED',
        decisionNotes: 'Candidate passed all entrance criteria with distinction.',
      },
    );
    expect(decision.id).toBeDefined();
    expect(decision.decision).toBe('APPROVED');

    // 2. Generate Offer
    const futureDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const offer = await offerService.generateOffer(tenantAlpha, app.id, {
      campusId: campusMain,
      academicYearId: academicYear2026,
      offeredGradeLevel: 'Grade 7 (Gold Stream)',
      acceptanceDeadline: futureDeadline,
      acceptanceFeeAmount: 50000,
      conditions: 'Submission of final primary school transcript and medical clearance.',
      decisionId: decision.id,
    });

    expect(offer.id).toBeDefined();
    expect(offer.offerNumber).toMatch(/^OFF-\d{4}-\d{4}$/);
    expect(offer.status).toBe('OFFERED');
    expect(offer.acceptanceFeePaid).toBe(false);
    expect(offer.offerLetterUrl).toContain('OFF-');

    // Check application status moved to OFFERED
    const appUpdated = await applicationService.getApplicationById(tenantAlpha, app.id);
    expect(appUpdated.status).toBe('OFFERED');
  });

  it('should process acceptance fee payment initialization and confirm offer acceptance', async () => {
    const app = await createReadyApp('Olumide', 'Bakare');

    const futureDeadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const offer = await offerService.generateOffer(tenantAlpha, app.id, {
      campusId: campusMain,
      academicYearId: academicYear2026,
      offeredGradeLevel: 'Grade 7',
      acceptanceDeadline: futureDeadline,
      acceptanceFeeAmount: 50000,
    });

    // Attempt to accept before fee payment should fail
    await expect(
      offerService.respondToOffer(tenantAlpha, offer.id, { response: 'ACCEPTED' }),
    ).rejects.toThrow(BadRequestException);

    // Initialize acceptance fee payment
    const paymentInit = await offerService.initializeAcceptancePayment(tenantAlpha, offer.id, {
      provider: 'PAYSTACK',
      callbackUrl: 'https://schoolportal.ng/admissions/offer-success',
    });
    expect(paymentInit.checkoutUrl).toBeDefined();
    expect(paymentInit.reference).toBeDefined();

    // Confirm payment reconciliation
    const confirmed = await offerService.confirmAcceptancePayment(
      tenantAlpha,
      offer.id,
      paymentInit.reference,
    );
    expect(confirmed.acceptanceFeePaid).toBe(true);
    expect(confirmed.status).toBe('ACCEPTED');

    // Verify application status is now ACCEPTED
    const appFinal = await applicationService.getApplicationById(tenantAlpha, app.id);
    expect(appFinal.status).toBe('ACCEPTED');
  });

  it('should decline offer and transition application to WITHDRAWN', async () => {
    const app = await createReadyApp('Victor', 'Moses');

    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const offer = await offerService.generateOffer(tenantAlpha, app.id, {
      campusId: campusMain,
      academicYearId: academicYear2026,
      offeredGradeLevel: 'Grade 7',
      acceptanceDeadline: futureDeadline,
      acceptanceFeeAmount: 0, // No fee
    });

    const declined = await offerService.respondToOffer(tenantAlpha, offer.id, {
      response: 'DECLINED',
      declineReason: 'Relocating to another state.',
    });

    expect(declined.status).toBe('DECLINED');

    const appUpdated = await applicationService.getApplicationById(tenantAlpha, app.id);
    expect(appUpdated.status).toBe('WITHDRAWN');
  });

  it('should reject offer acceptance if acceptance deadline has expired', async () => {
    const app = await createReadyApp('Grace', 'Oladipo');

    const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
    const offer = await offerService.generateOffer(tenantAlpha, app.id, {
      campusId: campusMain,
      academicYearId: academicYear2026,
      offeredGradeLevel: 'Grade 7',
      acceptanceDeadline: pastDeadline,
      acceptanceFeeAmount: 0,
    });

    await expect(
      offerService.respondToOffer(tenantAlpha, offer.id, { response: 'ACCEPTED' }),
    ).rejects.toThrow(BadRequestException);
  });
});
