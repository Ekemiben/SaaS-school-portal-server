import { Controller, Post, Get, Body, Param, Req, BadRequestException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { AdmissionInquiryService } from './services/admission-inquiry.service.js';
import { AdmissionApplicationService } from './services/admission-application.service.js';
import { AdmissionOfferService } from './services/admission-offer.service.js';
import { CreateAdmissionInquiryDto } from './dto/admission-inquiry.dto.js';
import { CreateAdmissionApplicationDto } from './dto/admission-application.dto.js';
import { RespondToOfferDto, InitializeAcceptancePaymentDto } from './dto/admission-offer.dto.js';

@Controller('public/admissions')
@Public()
export class AdmissionsPublicController {
  constructor(
    private readonly inquiryService: AdmissionInquiryService,
    private readonly applicationService: AdmissionApplicationService,
    private readonly offerService: AdmissionOfferService,
  ) {}

  private resolveTenantId(req: any): string {
    const tenantId = req.tenantId || req.tenantContext?.tenantId || req.headers['x-tenant-id'];
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required for public admission actions');
    }
    return tenantId;
  }

  @Post('inquiries')
  async submitInquiry(@Req() req: any, @Body() dto: CreateAdmissionInquiryDto) {
    const tenantId = this.resolveTenantId(req);
    return this.inquiryService.createInquiry(tenantId, dto);
  }

  @Post('applications')
  async submitApplication(@Req() req: any, @Body() dto: CreateAdmissionApplicationDto) {
    const tenantId = this.resolveTenantId(req);
    return this.applicationService.createApplication(tenantId, dto, true);
  }

  @Get('applications/status/:applicationNumber')
  async checkApplicationStatus(@Req() req: any, @Param('applicationNumber') appNum: string) {
    const tenantId = this.resolveTenantId(req);
    const app = await this.applicationService.getApplicationByNumber(tenantId, appNum);
    // Sanitize internal notes for public lookup
    const { internalNotes, reviewerUserId, ...sanitized } = app;
    return sanitized;
  }

  @Get('offers/:offerNumber')
  async getPublicOffer(@Req() req: any, @Param('offerNumber') offerNumber: string) {
    const tenantId = this.resolveTenantId(req);
    return this.offerService.getOfferByNumber(tenantId, offerNumber);
  }

  @Post('offers/:offerId/respond')
  async respondToOffer(
    @Req() req: any,
    @Param('offerId') offerId: string,
    @Body() dto: RespondToOfferDto,
  ) {
    const tenantId = this.resolveTenantId(req);
    return this.offerService.respondToOffer(tenantId, offerId, dto);
  }

  @Post('offers/:offerId/pay')
  async payAcceptanceFee(
    @Req() req: any,
    @Param('offerId') offerId: string,
    @Body() dto: InitializeAcceptancePaymentDto,
  ) {
    const tenantId = this.resolveTenantId(req);
    return this.offerService.initializeAcceptancePayment(tenantId, offerId, dto);
  }

  @Post('offers/:offerId/confirm-payment')
  async confirmPayment(
    @Req() req: any,
    @Param('offerId') offerId: string,
    @Body('paymentReference') reference: string,
  ) {
    const tenantId = this.resolveTenantId(req);
    return this.offerService.confirmAcceptancePayment(tenantId, offerId, reference);
  }
}
