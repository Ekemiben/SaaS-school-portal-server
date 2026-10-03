import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../modules/storage/storage.service.js';

export interface ReportJobData {
  reportType: 'report-card' | 'fee-summary' | 'attendance-sheet';
  tenantId: string;
  campusId?: string;
  parameters: Record<string, any>;
  requestedByUserId: string;
}

@Injectable()
export class ReportProcessor {
  private readonly logger = new Logger(ReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storageService?: StorageService,
  ) {}

  async process(job: { id: string; data: ReportJobData }) {
    const rawData = job.data as any;
    const tenantId = rawData?.tenantId || rawData?.parameters?.tenantId || 'global';
    const reportType = rawData?.reportType || rawData?.name || 'report';

    this.logger.log(`Processing asynchronous report ${reportType} for tenant ${tenantId}`);
    
    let downloadUrl: string;
    let artifactKey: string;

    if (this.storageService && tenantId && tenantId !== 'undefined') {
      const mockPdfBuffer = Buffer.from(
        `%PDF-1.4 Mock Report: ${reportType} for Tenant ${tenantId}`,
      );
      const safeReportName = String(reportType).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeReportName}_${Date.now()}.pdf`;
      const uploadResult = await this.storageService.uploadBuffer(
        tenantId,
        'reports',
        fileName,
        mockPdfBuffer,
        'application/pdf',
      );
      artifactKey = uploadResult.storageKey;
      downloadUrl = await this.storageService.getDownloadPresignedUrl(
        tenantId,
        artifactKey,
        fileName,
      );
    } else {
      artifactKey = `tenants/${tenantId}/reports/${reportType}_${Date.now()}.pdf`;
      downloadUrl = `https://storage.schoolportal.io/${artifactKey}`;
    }

    return {
      status: 'completed',
      artifactKey,
      downloadUrl,
      completedAt: new Date().toISOString(),
    };
  }
}
