import { Controller, Get, Post, Put, Body, Query, Param } from '@nestjs/common';
import { ResultsService } from './results.service.js';
import { AcademicSummaryService } from './services/academic-summary.service.js';
import { ReportCardService } from './services/report-card.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  CreateAssessmentStructureDto,
  UpdateAssessmentStructureDto,
  EnterWeightedScoreDto,
  BulkEnterWeightedScoresDto,
  EvaluateAssessmentDto,
} from './dto/assessment.dto.js';
import { CalculateClassSummariesDto } from './dto/academic-summary.dto.js';
import {
  PublishSingleReportCardDto,
  BatchPublishReportCardsDto,
} from './dto/report-card.dto.js';

@Controller('api/v1/results')
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
    private readonly academicSummaryService: AcademicSummaryService,
    private readonly reportCardService: ReportCardService,
  ) {}

  // --- Assessment Structures ---
  @Get('assessment-structures')
  async listAssessmentStructures(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
  ) {
    return this.resultsService.listAssessmentStructures(tenant.tenantId, campusId);
  }

  @Get('assessment-structures/:id')
  async getAssessmentStructure(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return this.resultsService.getAssessmentStructure(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Post('assessment-structures')
  async createAssessmentStructure(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateAssessmentStructureDto,
  ) {
    return this.resultsService.createAssessmentStructure(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Put('assessment-structures/:id')
  async updateAssessmentStructure(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentStructureDto,
  ) {
    return this.resultsService.updateAssessmentStructure(tenant.tenantId, id, dto);
  }

  // --- Assessment Preview / Evaluation ---
  @Post('evaluate-score')
  async evaluateScore(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: EvaluateAssessmentDto,
  ) {
    return this.resultsService.evaluateScore(tenant.tenantId, dto);
  }

  // --- Results Entry ---
  @RequirePermissions(SystemPermissions.RESULTS_ENTER)
  @Post('enter-weighted')
  async enterWeightedScore(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: EnterWeightedScoreDto,
  ) {
    return this.resultsService.enterWeightedScore(
      tenant.tenantId,
      user?.id || 'sys_user',
      dto,
    );
  }

  @RequirePermissions(SystemPermissions.RESULTS_ENTER)
  @Post('bulk-enter-weighted')
  async bulkEnterWeightedScores(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: BulkEnterWeightedScoresDto,
  ) {
    return this.resultsService.bulkEnterWeightedScores(
      tenant.tenantId,
      user?.id || 'sys_user',
      dto,
    );
  }

  @RequirePermissions(SystemPermissions.RESULTS_ENTER)
  @Post('enter')
  async enterMarks(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.resultsService.enterMarks(
      tenant.tenantId,
      user?.id || 'sys_user',
      body,
    );
  }

  // --- Querying Results ---
  @Get()
  async listResults(
    @CurrentTenant() tenant: TenantContext,
    @Query('examinationId') examinationId?: string,
    @Query('studentId') studentId?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.resultsService.getResults(tenant.tenantId, {
      examinationId,
      studentId,
      classId,
      subjectId,
    });
  }

  @Get('report-card/:studentId/:examinationId')
  async getReportCard(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.resultsService.getReportCard(tenant.tenantId, studentId, examinationId);
  }

  @Get('report-card/:studentId/:examinationId/print')
  async getPrintableReportCard(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.resultsService.getPrintableReportCard(tenant.tenantId, studentId, examinationId);
  }

  // --- Academic Summaries & Broadsheet ---
  @RequirePermissions(SystemPermissions.EXAMINATIONS_MANAGE)
  @Post('academic-summaries/calculate-class')
  async calculateClassSummaries(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CalculateClassSummariesDto,
  ) {
    return this.academicSummaryService.calculateClassSummaries(tenant.tenantId, dto);
  }

  @Get('academic-summaries/class/:classId/broadsheet')
  async getClassBroadsheet(
    @CurrentTenant() tenant: TenantContext,
    @Param('classId') classId: string,
    @Query('examinationId') examinationId: string,
  ) {
    return this.academicSummaryService.getClassBroadsheet(tenant.tenantId, classId, examinationId);
  }

  @Get('academic-summaries/student/:studentId')
  async getStudentAcademicHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
  ) {
    return this.academicSummaryService.getStudentAcademicHistory(tenant.tenantId, studentId);
  }

  @Get('academic-summaries/student/:studentId/exam/:examinationId')
  async getStudentAcademicSummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.academicSummaryService.getStudentAcademicSummary(
      tenant.tenantId,
      studentId,
      examinationId,
    );
  }

  @Get('academic-summaries/student/:studentId/transcript')
  async getStudentTranscript(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
  ) {
    return this.academicSummaryService.getStudentTranscript(tenant.tenantId, studentId);
  }

  // --- Report Cards & Batch PDF Publishing ---
  @Get('report-cards/preview/:studentId/:examinationId')
  async previewReportCard(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId') studentId: string,
    @Param('examinationId') examinationId: string,
  ) {
    return this.reportCardService.prepareReportCardData(tenant.tenantId, studentId, examinationId);
  }

  @RequirePermissions(SystemPermissions.RESULTS_PUBLISH)
  @Post('report-cards/publish-single')
  async publishSingleReportCard(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: PublishSingleReportCardDto,
  ) {
    return this.reportCardService.publishSingleReportCard(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.RESULTS_PUBLISH)
  @Post('report-cards/batch-publish')
  async batchPublishReportCards(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() dto: BatchPublishReportCardsDto,
  ) {
    return this.reportCardService.batchPublishReportCards(
      tenant.tenantId,
      user?.id || 'sys_user',
      dto,
    );
  }

  @Get('report-cards/batch-status/:jobId')
  async getBatchPublishStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('jobId') jobId: string,
  ) {
    return this.reportCardService.getBatchPublishStatus(tenant.tenantId, jobId);
  }

  // --- Approval & Publishing ---
  @RequirePermissions(SystemPermissions.RESULTS_APPROVE)
  @Post('approve')
  async approveResults(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
    @Body() body: { examinationId: string; classId?: string },
  ) {
    return this.resultsService.approveResults(
      tenant.tenantId,
      body.examinationId,
      user?.id || 'sys_user',
      body.classId,
    );
  }

  @RequirePermissions(SystemPermissions.RESULTS_PUBLISH)
  @Post('publish')
  async publishResults(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { examinationId: string; classId?: string },
  ) {
    return this.resultsService.publishResults(tenant.tenantId, body.examinationId, body.classId);
  }
}
