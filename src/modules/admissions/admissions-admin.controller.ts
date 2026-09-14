import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { AdmissionInquiryService } from './services/admission-inquiry.service.js';
import { AdmissionApplicationService } from './services/admission-application.service.js';
import { AdmissionScreeningService } from './services/admission-screening.service.js';
import { AdmissionInterviewService } from './services/admission-interview.service.js';
import { AdmissionOfferService } from './services/admission-offer.service.js';
import { AdmissionDocumentService } from './services/admission-document.service.js';
import { UpdateAdmissionInquiryDto, AdmissionInquiryFilterDto } from './dto/admission-inquiry.dto.js';
import { AssignReviewerDto, AddInternalNoteDto } from './dto/admission-application.dto.js';
import {
  ScheduleScreeningDto,
  RecordScreeningOutcomeDto,
  ScheduleEntranceTestDto,
  RecordEntranceTestScoreDto,
} from './dto/admission-screening.dto.js';
import { ScheduleInterviewDto, EvaluateInterviewDto } from './dto/admission-interview.dto.js';
import { CreateAdmissionDecisionDto, GenerateAdmissionOfferDto } from './dto/admission-offer.dto.js';
import { VerifyAdmissionDocumentDto } from './dto/admission-document.dto.js';

@Controller('admin/admissions')
export class AdmissionsAdminController {
  constructor(
    private readonly inquiryService: AdmissionInquiryService,
    private readonly applicationService: AdmissionApplicationService,
    private readonly screeningService: AdmissionScreeningService,
    private readonly interviewService: AdmissionInterviewService,
    private readonly offerService: AdmissionOfferService,
    private readonly documentService: AdmissionDocumentService,
  ) {}

  @Get('inquiries')
  @Permissions('admissions.view')
  async listInquiries(@Req() req: any, @Query() filter: AdmissionInquiryFilterDto) {
    return this.inquiryService.listInquiries(req.tenantId, filter);
  }

  @Patch('inquiries/:id')
  @Permissions('admissions.update')
  async updateInquiry(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionInquiryDto,
  ) {
    return this.inquiryService.updateInquiry(req.tenantId, id, dto);
  }

  @Post('applications/:id/review/assign')
  @Permissions('admissions.review')
  async assignReviewer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AssignReviewerDto,
  ) {
    return this.applicationService.assignReviewer(req.tenantId, id, dto);
  }

  @Post('applications/:id/review/notes')
  @Permissions('admissions.review')
  async addInternalNote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AddInternalNoteDto,
  ) {
    return this.applicationService.addInternalNote(req.tenantId, id, dto.note);
  }

  @Post('applications/:id/screenings')
  @Permissions('admissions.screening')
  async scheduleScreening(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ScheduleScreeningDto,
  ) {
    return this.screeningService.scheduleScreening(req.tenantId, id, req.user?.id || 'admin_user', dto);
  }

  @Patch('screenings/:screeningId')
  @Permissions('admissions.screening')
  async recordScreeningOutcome(
    @Req() req: any,
    @Param('screeningId') screeningId: string,
    @Body() dto: RecordScreeningOutcomeDto,
  ) {
    return this.screeningService.recordScreeningOutcome(req.tenantId, screeningId, dto);
  }

  @Post('applications/:id/entrance-tests')
  @Permissions('admissions.screening')
  async scheduleEntranceTest(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ScheduleEntranceTestDto,
  ) {
    return this.screeningService.scheduleEntranceTest(req.tenantId, id, dto);
  }

  @Patch('entrance-tests/:testId')
  @Permissions('admissions.screening')
  async recordEntranceTestScore(
    @Req() req: any,
    @Param('testId') testId: string,
    @Body() dto: RecordEntranceTestScoreDto,
  ) {
    return this.screeningService.recordEntranceTestScore(req.tenantId, testId, dto);
  }

  @Post('applications/:id/interviews')
  @Permissions('admissions.interview')
  async scheduleInterview(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.interviewService.scheduleInterview(req.tenantId, id, dto);
  }

  @Patch('interviews/:interviewId')
  @Permissions('admissions.interview')
  async evaluateInterview(
    @Req() req: any,
    @Param('interviewId') interviewId: string,
    @Body() dto: EvaluateInterviewDto,
  ) {
    return this.interviewService.evaluateInterview(req.tenantId, interviewId, dto);
  }

  @Post('applications/:id/decision')
  @Permissions('admissions.decision')
  async createDecision(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateAdmissionDecisionDto,
  ) {
    return this.offerService.createDecision(req.tenantId, id, req.user?.id || 'admin_user', dto);
  }

  @Post('applications/:id/offers')
  @Permissions('admissions.offer')
  async generateOffer(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: GenerateAdmissionOfferDto,
  ) {
    return this.offerService.generateOffer(req.tenantId, id, dto);
  }

  @Patch('documents/:documentId/verify')
  @Permissions('admissions.review')
  async verifyDocument(
    @Req() req: any,
    @Param('documentId') documentId: string,
    @Body() dto: VerifyAdmissionDocumentDto,
  ) {
    return this.documentService.verifyDocument(req.tenantId, documentId, req.user?.id || 'admin_user', dto);
  }
}
