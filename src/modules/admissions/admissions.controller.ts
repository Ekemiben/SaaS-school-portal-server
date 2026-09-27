import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { RequireSubscriptionFeature } from '../../common/decorators/subscription-feature.decorator.js';
import { AdmissionApplicationService } from './services/admission-application.service.js';
import { AdmissionDocumentService } from './services/admission-document.service.js';
import {
  CreateAdmissionApplicationDto,
  UpdateAdmissionApplicationDto,
  TransitionApplicationStatusDto,
  AdmissionApplicationFilterDto,
} from './dto/admission-application.dto.js';
import { UploadAdmissionDocumentDto } from './dto/admission-document.dto.js';

@Controller(['api/v1/admissions', 'admissions'])
@RequireSubscriptionFeature('ADMISSIONS_PORTAL')
export class AdmissionsController {
  constructor(
    private readonly applicationService: AdmissionApplicationService,
    private readonly documentService: AdmissionDocumentService,
  ) {}

  @Get('applications')
  @Permissions('admissions.view')
  async listApplications(@Req() req: any, @Query() filter: AdmissionApplicationFilterDto) {
    return this.applicationService.listApplications(req.tenantId, filter);
  }

  @Get('applications/:id')
  @Permissions('admissions.view')
  async getApplicationById(@Req() req: any, @Param('id') id: string) {
    return this.applicationService.getApplicationById(req.tenantId, id);
  }

  @Post('applications')
  @Permissions('admissions.create')
  async createApplication(@Req() req: any, @Body() dto: CreateAdmissionApplicationDto) {
    return this.applicationService.createApplication(req.tenantId, dto, false);
  }

  @Patch('applications/:id')
  @Permissions('admissions.update')
  async updateApplication(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionApplicationDto,
  ) {
    return this.applicationService.updateApplication(req.tenantId, id, dto);
  }

  @Post('applications/:id/status')
  @Permissions('admissions.update')
  async transitionStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: TransitionApplicationStatusDto,
  ) {
    return this.applicationService.transitionStatus(req.tenantId, id, dto);
  }

  @Post('applications/:id/enroll')
  @Permissions('admissions.update')
  async enrollCandidate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.applicationService.enrollCandidate(req.tenantId, id, body);
  }

  @Delete('applications/:id')
  @Permissions('admissions.update')
  async deleteApplication(@Req() req: any, @Param('id') id: string) {
    return this.applicationService.deleteApplication(req.tenantId, id);
  }

  @Post('applications/:id/documents')
  @Permissions('admissions.create')
  async attachDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UploadAdmissionDocumentDto,
  ) {
    return this.documentService.attachDocument(req.tenantId, id, dto);
  }

  @Get('applications/:id/documents')
  @Permissions('admissions.view')
  async listDocuments(@Req() req: any, @Param('id') id: string) {
    return this.documentService.listDocuments(req.tenantId, id);
  }
}
