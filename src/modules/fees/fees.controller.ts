import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { FeesService } from './fees.service.js';
import { BulkInvoicingService } from './services/bulk-invoicing.service.js';
import { DebtRecoveryService } from './services/debt-recovery.service.js';
import { PaymentPlanService } from './services/payment-plan.service.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { TenantContext } from '../../common/types/tenant-context.interface.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { SystemPermissions } from '../../common/constants/permissions.js';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureDto,
  EvaluateStudentFeeDto,
} from './dto/fee-structure.dto.js';
import {
  BulkGenerateInvoicesDto,
  SiblingDiscountConfigDto,
} from './dto/bulk-invoice.dto.js';
import {
  DefaulterFilterDto,
  SendDebtReminderDto,
  ExamClearancePolicyDto,
  CreatePaymentPlanDto,
  ExamType,
} from './dto/debt-recovery.dto.js';

@Controller('api/v1/fees')
export class FeesController {
  constructor(
    private readonly feesService: FeesService,
    private readonly bulkInvoicingService: BulkInvoicingService,
    private readonly debtRecoveryService: DebtRecoveryService,
    private readonly paymentPlanService: PaymentPlanService,
  ) {}

  // --- Fee Structures ---
  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('structures')
  async listFeeStructures(
    @CurrentTenant() tenant: TenantContext,
    @Query('campusId') campusId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.feesService.getFeeStructures(tenant.tenantId, { campusId, academicYearId, termId, classId });
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('structures/:id')
  async getFeeStructure(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.feesService.getFeeStructureById(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.FEES_CREATE)
  @Post('structures')
  async createFeeStructure(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateFeeStructureDto) {
    return this.feesService.createFeeStructure(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Put('structures/:id')
  async updateFeeStructure(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateFeeStructureDto) {
    return this.feesService.updateFeeStructure(tenant.tenantId, id, dto);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Delete('structures/:id')
  async deleteFeeStructure(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.feesService.deleteFeeStructure(tenant.tenantId, id);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Post('evaluate')
  async evaluateFee(@CurrentTenant() tenant: TenantContext, @Body() dto: EvaluateStudentFeeDto) {
    return this.feesService.evaluateStudentFee(tenant.tenantId, dto);
  }

  // --- Sibling Discounts ---
  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('sibling-discounts/config')
  async getSiblingDiscountConfig(@CurrentTenant() tenant: TenantContext) {
    return this.bulkInvoicingService.getSiblingDiscountConfig(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Put('sibling-discounts/config')
  async updateSiblingDiscountConfig(@CurrentTenant() tenant: TenantContext, @Body() dto: SiblingDiscountConfigDto) {
    return this.bulkInvoicingService.updateSiblingDiscountConfig(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('sibling-discounts/family/:parentId')
  async getFamilySiblingBreakdown(@CurrentTenant() tenant: TenantContext, @Param('parentId') parentId: string) {
    return this.bulkInvoicingService.getFamilySiblingBreakdown(tenant.tenantId, parentId);
  }

  // --- Invoicing & Bulk Invoicing ---
  @Get('portal/my-invoices')
  async getMyInvoices(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: any,
  ) {
    return this.feesService.getMyInvoices(tenant.tenantId, user?.id || user?.sub);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('invoices')
  async listInvoices(
    @CurrentTenant() tenant: TenantContext,
    @Query('studentId') studentId?: string,
    @Query('status') status?: string,
    @Query('classId') classId?: string,
  ) {
    return this.feesService.getInvoices(tenant.tenantId, { studentId, status, classId });
  }

  @RequirePermissions(SystemPermissions.INVOICES_MANAGE)
  @Post('invoices')
  async generateInvoice(@CurrentTenant() tenant: TenantContext, @Body() body: any) {
    return this.feesService.generateInvoice(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.INVOICES_MANAGE)
  @Post('invoices/bulk-generate')
  async bulkGenerateInvoices(@CurrentTenant() tenant: TenantContext, @Body() dto: BulkGenerateInvoicesDto) {
    return this.bulkInvoicingService.bulkGenerateInvoices(tenant.tenantId, tenant.userId || 'system', dto);
  }

  @RequirePermissions(SystemPermissions.INVOICES_MANAGE)
  @Post('invoices/preview-bulk')
  async previewBulkInvoices(@CurrentTenant() tenant: TenantContext, @Body() dto: BulkGenerateInvoicesDto) {
    return this.bulkInvoicingService.bulkGenerateInvoices(tenant.tenantId, tenant.userId || 'system', { ...dto, dryRun: true });
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('invoices/:id/download')
  async downloadInvoice(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.bulkInvoicingService.getInvoiceDownload(tenant.tenantId, id);
  }

  // --- Defaulters & Debt Recovery ---
  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('defaulters')
  async getDefaulters(@CurrentTenant() tenant: TenantContext, @Query() query: DefaulterFilterDto) {
    return this.debtRecoveryService.getDefaulters(tenant.tenantId, query);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('collection-analytics')
  async getCollectionAnalytics(@CurrentTenant() tenant: TenantContext, @Query() query: DefaulterFilterDto) {
    return this.debtRecoveryService.getCollectionAnalytics(tenant.tenantId, query);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Post('debt-reminders')
  async sendDebtReminders(@CurrentTenant() tenant: TenantContext, @Body() dto: SendDebtReminderDto) {
    return this.debtRecoveryService.sendDebtReminders(tenant.tenantId, dto);
  }

  // --- Exam Clearance ---
  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('exam-clearance/policy')
  async getExamClearancePolicy(@CurrentTenant() tenant: TenantContext) {
    return this.debtRecoveryService.getExamClearancePolicy(tenant.tenantId);
  }

  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Put('exam-clearance/policy')
  async updateExamClearancePolicy(@CurrentTenant() tenant: TenantContext, @Body() policy: ExamClearancePolicyDto) {
    return this.debtRecoveryService.updateExamClearancePolicy(tenant.tenantId, policy);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('exam-clearance/check')
  async checkExamClearance(
    @CurrentTenant() tenant: TenantContext,
    @Query('studentId') studentId: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('termId') termId?: string,
    @Query('examType') examType: ExamType = ExamType.FINAL_EXAM,
  ) {
    return this.debtRecoveryService.checkExamClearance({ tenantId: tenant.tenantId, studentId, academicYearId, termId, examType });
  }

  // --- Payment Plans ---
  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Post('payment-plans')
  async createPaymentPlan(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePaymentPlanDto) {
    return this.paymentPlanService.createPaymentPlan(tenant.tenantId, dto);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('payment-plans/:invoiceId')
  async getPaymentPlan(@CurrentTenant() tenant: TenantContext, @Param('invoiceId') invoiceId: string) {
    return this.paymentPlanService.getPaymentPlan(tenant.tenantId, invoiceId);
  }

  // --- Waivers & Discounts ---
  @RequirePermissions(SystemPermissions.FEES_MANAGE)
  @Post('waivers')
  async applyFeeWaiver(@CurrentTenant() tenant: TenantContext, @Body() body: any) {
    return this.feesService.applyFeeWaiver(tenant.tenantId, body);
  }

  @RequirePermissions(SystemPermissions.FEES_VIEW)
  @Get('waivers')
  async getWaivers(@CurrentTenant() tenant: TenantContext, @Query('studentId') studentId?: string) {
    return this.feesService.getWaivers(tenant.tenantId, studentId);
  }
}
