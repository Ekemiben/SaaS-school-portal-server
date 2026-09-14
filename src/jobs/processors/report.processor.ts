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
    this.logger.log(`Processing asynchronous report ${job.data.reportType} for tenant ${job.data.tenantId}`);
    
    let downloadUrl: string;
    let artifactKey: string;

    if (this.storageService) {
      const mockPdfBuffer = Buffer.from(
        `%PDF-1.4 Mock Report: ${job.data.reportType} for Tenant ${job.data.tenantId}`,
      );
      const fileName = `${job.data.reportType}_${Date.now()}.pdf`;
      const uploadResult = await this.storageService.uploadBuffer(
        job.data.tenantId,
        'reports',
        fileName,
        mockPdfBuffer,
        'application/pdf',
      );
      artifactKey = uploadResult.storageKey;
      downloadUrl = await this.storageService.getDownloadPresignedUrl(
        job.data.tenantId,
        artifactKey,
        fileName,
      );
    } else {
      artifactKey = `tenants/${job.data.tenantId}/reports/${job.data.reportType}_${Date.now()}.pdf`;
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
