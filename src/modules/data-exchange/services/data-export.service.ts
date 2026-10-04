import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CsvParserService } from './csv-parser.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { CreateExportJobDto, ExportJobFilterDto } from '../dto/export-data.dto.js';

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csvParser: CsvParserService,
    private readonly auditService: AuditService,
  ) {}

  async createExportJob(tenantId: string, userId: string, dto: CreateExportJobDto) {
    const format = (dto.format || 'JSON').toUpperCase();
    const entities = dto.entities || ['ALL'];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000); // 7 days link

    const job = await this.prisma.dataExportJob.create({
      data: {
        tenantId,
        format,
        entities,
        status: 'PROCESSING',
        fileUrl: null,
        fileSizeBytes: 0,
        expiresAt,
        error: null,
        requestedByUserId: userId,
      },
    });

    try {
      let exportPayload: any = null;
      if (format === 'JSON') {
        exportPayload = await this.getFullTenantBackupSnapshot(tenantId, dto.anonymize);
      } else {
        exportPayload = await this.exportEntityCsv(tenantId, entities[0] || 'students');
      }

      const payloadStr = typeof exportPayload === 'string' ? exportPayload : JSON.stringify(exportPayload);
      const sizeBytes = Buffer.byteLength(payloadStr, 'utf8');

      const updatedJob = await this.prisma.dataExportJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          fileUrl: `https://storage.schoolportal.io/exports/${tenantId}/${job.id}.${format.toLowerCase()}`,
          fileSizeBytes: sizeBytes,
          completedAt: new Date(),
        },
      });

      await this.auditService.log({
        tenantId,
        actorUserId: userId,
        action: 'DATA_EXPORT_COMPLETED',
        resourceType: 'EXPORT_JOB',
        resourceId: job.id,
        afterData: { format, sizeBytes, entities },
      });

      return updatedJob;
    } catch (err: any) {
      return this.prisma.dataExportJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          error: err.message,
        },
      });
    }
  }

  async getFullTenantBackupSnapshot(tenantId: string, anonymize?: boolean) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId}' not found`);
    }

    const [
      students,
      parents,
      teachers,
      classes,
      subjects,
      attendance,
      results,
      invoices,
      payments,
      hostels,
      books,
      inventoryItems,
      schoolAssets,
    ] = await Promise.all([
      this.prisma.student.findMany({ where: { tenantId } }),
      this.prisma.parent.findMany({ where: { tenantId } }),
      this.prisma.teacher.findMany({ where: { tenantId } }),
      this.prisma.class.findMany({ where: { tenantId } }),
      this.prisma.subject.findMany({ where: { tenantId } }),
      this.prisma.attendance.findMany({ where: { tenantId } }),
      this.prisma.result.findMany({ where: { tenantId } }),
      this.prisma.invoice.findMany({ where: { tenantId } }),
      this.prisma.payment.findMany({ where: { tenantId } }),
      this.prisma.hostel.findMany({ where: { tenantId } }),
      this.prisma.book.findMany({ where: { tenantId } }),
      this.prisma.inventoryItem.findMany({ where: { tenantId } }),
      this.prisma.schoolAsset.findMany({ where: { tenantId } }),
    ]);

    const sanitizeUser = (u: any) => {
      if (!anonymize) return u;
      return {
        ...u,
        firstName: 'Anonymized',
        lastName: `User_${u.id?.slice(-4)}`,
        email: `masked_${u.id?.slice(-4)}@anonymized.local`,
        phone: '+234000000000',
      };
    };

    return {
      metadata: {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        tenantId,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        isAnonymized: !!anonymize,
      },
      data: {
        tenant,
        students: students.map(sanitizeUser),
        parents: parents.map(sanitizeUser),
        teachers: teachers.map(sanitizeUser),
        classes,
        subjects,
        attendance,
        results,
        invoices,
        payments,
        hostels,
        books,
        inventoryItems,
        schoolAssets,
      },
    };
  }

  async exportEntityCsv(tenantId: string, entityName: string): Promise<string> {
    const lower = entityName.toLowerCase();
    let data: any[] = [];
    let headers: string[] = [];

    if (lower === 'students') {
      data = await this.prisma.student.findMany({ where: { tenantId } });
      headers = ['id', 'admissionNumber', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'status'];
    } else if (lower === 'teachers' || lower === 'staff') {
      data = await this.prisma.teacher.findMany({ where: { tenantId } });
      headers = ['id', 'employeeNumber', 'firstName', 'lastName', 'email', 'specialization', 'isActive'];
    } else if (lower === 'inventory' || lower === 'inventoryitems') {
      data = await this.prisma.inventoryItem.findMany({ where: { tenantId } });
      headers = ['id', 'sku', 'name', 'category', 'unitOfMeasure', 'unitCost', 'quantityOnHand', 'status'];
    } else if (lower === 'assets' || lower === 'schoolassets') {
      data = await this.prisma.schoolAsset.findMany({ where: { tenantId } });
      headers = ['id', 'assetTag', 'name', 'category', 'purchaseCost', 'currentBookValue', 'condition', 'status'];
    } else {
      data = await this.prisma.student.findMany({ where: { tenantId } });
      headers = ['id', 'admissionNumber', 'firstName', 'lastName', 'status'];
    }

    return this.csvParser.stringify(headers, data);
  }

  async getExportJob(tenantId: string, jobId: string) {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { id: jobId, tenantId },
    });
    if (!job) {
      throw new NotFoundException(`Export job '${jobId}' not found`);
    }
    return job;
  }

  async listExportJobs(tenantId: string, filter?: ExportJobFilterDto) {
    const where: any = { tenantId };

    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.format) {
      where.format = filter.format;
    }

    return this.prisma.dataExportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
