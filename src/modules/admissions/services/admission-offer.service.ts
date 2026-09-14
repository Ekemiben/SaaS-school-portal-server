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
    const app = await this.applicationService.getApplicationById(tenantId, applicationId);
    const id = `dec_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const decision = {
      id,
      tenantId,
      applicationId,
      decision: dto.decision,
      decisionDate: new Date(),
      decidedByUserId,
      decisionNotes: dto.decisionNotes || null,
      rejectionReason: dto.rejectionReason || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionDecision) {
      try {
        await (this.prisma as any).admissionDecision.create({ data: decision });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionDecision failed: ${err.message}`);
      }
    }

    this.prisma.memoryStore.admissionDecisions.set(id, decision);

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
    const count = this.prisma.memoryStore.admissionOffers.size + 1;
    const offerNumber = `OFF-${year}-${String(count).padStart(4, '0')}`;
    const id = `ofr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const feeAmount = dto.acceptanceFeeAmount || 0;

    let invoiceId: string | null = null;
    if (feeAmount > 0) {
      invoiceId = `inv_acc_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
      const invoice = {
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
        lineItems: [{ name: 'Admission Acceptance Fee', amount: feeAmount }],
        notes: `Admission Acceptance Fee for ${app.studentFirstName} ${app.studentLastName} (${offerNumber})`,
        dueDate: new Date(dto.acceptanceDeadline),
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.invoices.set(invoiceId, invoice);
    }

    const offer: any = {
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
      offerLetterUrl: null,
      decisionId: dto.decisionId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    offer.offerLetterUrl = await this.letterRenderer.renderOfferLetter(tenantId, offer, app);

    if (this.prisma.isDbConnected && (this.prisma as any).admissionOffer) {
      try {
        await (this.prisma as any).admissionOffer.create({ data: offer });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionOffer failed: ${err.message}`);
      }
    }

    this.prisma.memoryStore.admissionOffers.set(id, offer);

    await this.applicationService.transitionStatus(tenantId, applicationId, {
      status: 'OFFERED',
      internalNotes: `Offer ${offerNumber} generated with deadline ${offer.acceptanceDeadline.toISOString()}`,
    });

    this.logger.log(`Generated offer ${offerNumber} for application ${applicationId}`);
    return offer;
  }

  async getOfferById(tenantId: string, offerId: string) {
    const offer = this.prisma.memoryStore.admissionOffers.get(offerId);
    if (!offer || offer.tenantId !== tenantId) {
      throw new NotFoundException(`Admission offer ${offerId} not found`);
    }
    return offer;
  }

  async getOfferByNumber(tenantId: string, offerNumber: string) {
    const offer = Array.from(this.prisma.memoryStore.admissionOffers.values()).find(
      (o: any) => o.tenantId === tenantId && o.offerNumber === offerNumber,
    );
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
      offer.status = 'EXPIRED';
      this.prisma.memoryStore.admissionOffers.set(offerId, offer);
      throw new BadRequestException(`Offer ${offer.offerNumber} has expired on ${offer.acceptanceDeadline.toISOString()}`);
    }

    if (dto.response === 'ACCEPTED') {
      if (offer.acceptanceFeeAmount > 0 && !offer.acceptanceFeePaid) {
        throw new BadRequestException(
          `Acceptance fee of ₦${offer.acceptanceFeeAmount.toLocaleString()} must be paid to confirm acceptance.`,
        );
      }
      offer.status = 'ACCEPTED';
      await this.applicationService.transitionStatus(tenantId, offer.applicationId, {
        status: 'ACCEPTED',
        internalNotes: `Offer ${offer.offerNumber} accepted by applicant`,
      });
    } else {
      offer.status = 'DECLINED';
      await this.applicationService.transitionStatus(tenantId, offer.applicationId, {
        status: 'WITHDRAWN',
        internalNotes: `Offer ${offer.offerNumber} declined. Reason: ${dto.declineReason || 'Not specified'}`,
      });
    }

    offer.updatedAt = new Date();
    this.prisma.memoryStore.admissionOffers.set(offerId, offer);
    return offer;
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
      amount: offer.acceptanceFeeAmount,
      currency: 'NGN',
      customerEmail: app.parentEmail,
      provider: (dto.provider as any) || undefined,
      callbackUrl: dto.callbackUrl,
    });
  }

  async confirmAcceptancePayment(tenantId: string, offerId: string, paymentReference: string) {
    const offer = await this.getOfferById(tenantId, offerId);
    if (offer.invoiceId) {
      const invoice = this.prisma.memoryStore.invoices.get(offer.invoiceId);
      if (invoice) {
        invoice.paidAmount = invoice.totalAmount;
        invoice.balanceAmount = 0;
        invoice.status = 'PAID';
        invoice.paidAt = new Date();
      }
    }

    offer.acceptanceFeePaid = true;
    offer.status = 'ACCEPTED';
    offer.updatedAt = new Date();
    this.prisma.memoryStore.admissionOffers.set(offerId, offer);

    await this.applicationService.transitionStatus(tenantId, offer.applicationId, {
      status: 'ACCEPTED',
      internalNotes: `Acceptance fee verified via reference ${paymentReference}. Offer marked ACCEPTED.`,
    });

    this.logger.log(`Acceptance fee paid for offer ${offer.offerNumber} (${paymentReference})`);
    return offer;
  }
}
