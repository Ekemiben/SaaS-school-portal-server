import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateAdmissionDecisionDto,
  GenerateAdmissionOfferDto,
  RespondToOfferDto,
  InitializeAcceptancePaymentDto,
} from '../dto/admission-offer.dto.js';
import { AdmissionApplicationService } from './admission-application.service.js';
import { AdmissionLetterRendererService } from './admission-letter-renderer.service.js';
import { PaymentsService } from '../../payments/payments.service.js';

@Injectable()
export class AdmissionOfferService {
  private readonly logger = new Logger(AdmissionOfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationService: AdmissionApplicationService,
    private readonly letterRenderer: AdmissionLetterRendererService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async createDecision(
    tenantId: string,
    applicationId: string,
    decidedByUserId: string,
    dto: CreateAdmissionDecisionDto,
  ) {
    await this.applicationService.getApplicationById(tenantId, applicationId);
    const id = `dec_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const decision = await this.prisma.admissionDecision.create({
      data: {
        id,
        tenantId,
        applicationId,
        decision: dto.decision,
        decisionDate: new Date(),
        decidedByUserId,
        decisionNotes: dto.decisionNotes || null,
        rejectionReason: dto.rejectionReason || null,
      },
    });

    if (dto.decision === 'REJECTED') {
      await this.applicationService.transitionStatus(tenantId, applicationId, {
        status: 'REJECTED',
        rejectionReason: dto.rejectionReason || dto.decisionNotes || 'Application not successful',
      });
    }

    this.logger.log(`Admission decision ${dto.decision} recorded for application ${applicationId}`);
    return decision;
  }

  async generateOffer(
    tenantId: string,
    applicationId: string,
    dto: GenerateAdmissionOfferDto,
  ) {
    const app = await this.applicationService.getApplicationById(tenantId, applicationId);
    if (app.status === 'REJECTED' || app.status === 'WITHDRAWN') {
      throw new BadRequestException(`Cannot generate offer for an application in ${app.status} state.`);
    }

    const year = new Date().getFullYear();
    const count = (await this.prisma.admissionOffer.count({ where: { tenantId } })) + 1;
    const offerNumber = `OFF-${year}-${String(count).padStart(4, '0')}`;
    const id = `ofr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const feeAmount = dto.acceptanceFeeAmount || 0;

    let invoiceId: string | null = null;
    if (feeAmount > 0) {
      invoiceId = `inv_acc_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
      await this.prisma.invoice.create({
        data: {
          id: invoiceId,
          tenantId,
          studentId: app.id,
          invoiceNumber: `INV-ACC-${year}-${String(count).padStart(4, '0')}`,
          subtotal: feeAmount,
          discountAmount: 0,
          waiverAmount: 0,
          latePenaltyAmount: 0,
          totalAmount: feeAmount,
          paidAmount: 0,
          balanceAmount: feeAmount,
          currency: 'NGN',
          notes: `Admission Acceptance Fee for ${app.studentFirstName} ${app.studentLastName} (${offerNumber})`,
          dueDate: new Date(dto.acceptanceDeadline),
          status: 'PENDING',
        },
      });
    }

    const offerLetterUrl = await this.letterRenderer.renderOfferLetter(
      tenantId,
      {
        offerNumber,
        offeredGradeLevel: dto.offeredGradeLevel,
        campusId: dto.campusId,
        offerDate: new Date(),
        acceptanceDeadline: new Date(dto.acceptanceDeadline),
        acceptanceFeeAmount: feeAmount,
        conditions: dto.conditions || null,
      },
      app,
    );

    const offer = await this.prisma.admissionOffer.create({
      data: {
        id,
        tenantId,
        campusId: dto.campusId,
        academicYearId: dto.academicYearId,
        applicationId,
        offeredGradeLevel: dto.offeredGradeLevel,
        offerNumber,
        offerDate: new Date(),
        acceptanceDeadline: new Date(dto.acceptanceDeadline),
        conditions: dto.conditions || null,
        status: 'OFFERED',
        acceptanceFeeAmount: feeAmount,
        acceptanceFeePaid: feeAmount === 0,
        invoiceId,
        offerLetterUrl,
        decisionId: dto.decisionId || null,
      },
    });

    await this.applicationService.transitionStatus(tenantId, applicationId, {
      status: 'OFFERED',
      internalNotes: `Offer ${offerNumber} generated with deadline ${offer.acceptanceDeadline.toISOString()}`,
    });

    this.logger.log(`Generated offer ${offerNumber} for application ${applicationId}`);
    return offer;
  }

  async getOfferById(tenantId: string, offerId: string) {
    const offer = await this.prisma.admissionOffer.findFirst({
      where: { id: offerId, tenantId },
    });
    if (!offer) {
      throw new NotFoundException(`Admission offer ${offerId} not found`);
    }
    return offer;
  }

  async getOfferByNumber(tenantId: string, offerNumber: string) {
    const offer = await this.prisma.admissionOffer.findFirst({
      where: { tenantId, offerNumber },
    });
    if (!offer) {
      throw new NotFoundException(`Offer ${offerNumber} not found`);
    }
    return offer;
  }

  async respondToOffer(tenantId: string, offerId: string, dto: RespondToOfferDto) {
    const offer = await this.getOfferById(tenantId, offerId);
    if (offer.status !== 'OFFERED') {
      throw new BadRequestException(`Offer is already ${offer.status}.`);
    }

    if (new Date() > new Date(offer.acceptanceDeadline)) {
      await this.prisma.admissionOffer.update({
        where: { id: offerId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(`Offer ${offer.offerNumber} has expired on ${offer.acceptanceDeadline.toISOString()}`);
    }

    let targetOfferStatus = offer.status;
    const feeAmount = offer.acceptanceFeeAmount ?? 0;
    if (dto.response === 'ACCEPTED') {
      if (feeAmount > 0 && !offer.acceptanceFeePaid) {
        throw new BadRequestException(
          `Acceptance fee of ₦${feeAmount.toLocaleString()} must be paid to confirm acceptance.`,
        );
      }
      targetOfferStatus = 'ACCEPTED';
      await this.applicationService.transitionStatus(tenantId, offer.applicationId, {
        status: 'ACCEPTED',
        internalNotes: `Offer ${offer.offerNumber} accepted by applicant`,
      });
    } else {
      targetOfferStatus = 'DECLINED';
      await this.applicationService.transitionStatus(tenantId, offer.applicationId, {
        status: 'WITHDRAWN',
        internalNotes: `Offer ${offer.offerNumber} declined. Reason: ${dto.declineReason || 'Not specified'}`,
      });
    }

    const updated = await this.prisma.admissionOffer.update({
      where: { id: offerId },
      data: { status: targetOfferStatus },
    });

    return updated;
  }

  async initializeAcceptancePayment(
    tenantId: string,
    offerId: string,
    dto: InitializeAcceptancePaymentDto,
  ) {
    const offer = await this.getOfferById(tenantId, offerId);
    if (!offer.invoiceId) {
      throw new BadRequestException('This offer does not have an associated fee invoice.');
    }
    const app = await this.applicationService.getApplicationById(tenantId, offer.applicationId);

    return this.paymentsService.initializePayment(tenantId, {
      invoiceId: offer.invoiceId,
      studentId: app.id,
      amount: offer.acceptanceFeeAmount || 0,
      currency: 'NGN',
      customerEmail: app.parentEmail || 'admissions@school.edu',
      provider: (dto.provider as any) || undefined,
      callbackUrl: dto.callbackUrl,
    });
  }

  async confirmAcceptancePayment(tenantId: string, offerId: string, paymentReference: string) {
    const offer = await this.getOfferById(tenantId, offerId);
    if (offer.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: offer.invoiceId },
        data: {
          paidAmount: offer.acceptanceFeeAmount || 0,
          balanceAmount: 0,
          status: 'PAID',
        },
      }).catch(() => {});
    }

    const updated = await this.prisma.admissionOffer.update({
      where: { id: offerId },
      data: {
        acceptanceFeePaid: true,
        status: 'ACCEPTED',
      },
    });

    await this.applicationService.transitionStatus(tenantId, offer.applicationId, {
      status: 'ACCEPTED',
      internalNotes: `Acceptance fee verified via reference ${paymentReference}. Offer marked ACCEPTED.`,
    });

    this.logger.log(`Acceptance fee paid for offer ${offer.offerNumber} (${paymentReference})`);
    return updated;
  }
}
