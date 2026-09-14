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
    const jobId = `expjob_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const format = (dto.format || 'JSON').toUpperCase();
    const entities = dto.entities || ['ALL'];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000); // 7 days link

    const job = {
      id: jobId,
      tenantId,
      format,
      entities,
      status: 'PROCESSING',
      fileUrl: null as string | null,
      fileSizeBytes: 0,
      expiresAt,
      error: null as string | null,
      requestedByUserId: userId,
      createdAt: now,
      completedAt: null as Date | null,
    };

    this.prisma.memoryStore.dataExportJobs.set(jobId, job);

    // Process export synchronously/in-memory for resilience
    try {
      let exportPayload: any = null;
      if (format === 'JSON') {
        exportPayload = await this.getFullTenantBackupSnapshot(tenantId, dto.anonymize);
      } else {
        exportPayload = await this.exportEntityCsv(tenantId, entities[0] || 'students');
      }

      const payloadStr = typeof exportPayload === 'string' ? exportPayload : JSON.stringify(exportPayload);
      const sizeBytes = Buffer.byteLength(payloadStr, 'utf8');

      job.status = 'COMPLETED';
      job.fileUrl = `https://storage.schoolportal.io/exports/${tenantId}/${jobId}.${format.toLowerCase()}`;
      job.fileSizeBytes = sizeBytes;
      job.completedAt = new Date();
      this.prisma.memoryStore.dataExportJobs.set(jobId, job);

      await this.auditService.log({
        tenantId,
        actorUserId: userId,
        action: 'DATA_EXPORT_COMPLETED',
        resourceType: 'EXPORT_JOB',
        resourceId: jobId,
        afterData: { format, sizeBytes, entities },
      });
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err.message;
      this.prisma.memoryStore.dataExportJobs.set(jobId, job);
    }

    return job;
  }

  async getFullTenantBackupSnapshot(tenantId: string, anonymize?: boolean) {
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId}' not found`);
    }

    const filterTenant = (map: Map<string, any>) =>
      Array.from(map.values()).filter((item: any) => item.tenantId === tenantId);

    const students = filterTenant(this.prisma.memoryStore.students);
    const parents = filterTenant(this.prisma.memoryStore.parents);
    const teachers = filterTenant(this.prisma.memoryStore.teachers);
    const classes = filterTenant(this.prisma.memoryStore.classes);
    const subjects = filterTenant(this.prisma.memoryStore.subjects);
    const attendance = filterTenant(this.prisma.memoryStore.attendance);
    const results = filterTenant(this.prisma.memoryStore.results);
    const invoices = filterTenant(this.prisma.memoryStore.invoices);
    const payments = filterTenant(this.prisma.memoryStore.payments);
    const hostels = filterTenant(this.prisma.memoryStore.hostels);
    const books = filterTenant(this.prisma.memoryStore.books);
    const inventoryItems = filterTenant(this.prisma.memoryStore.inventoryItems);
    const schoolAssets = filterTenant(this.prisma.memoryStore.schoolAssets);

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
      data = Array.from(this.prisma.memoryStore.students.values()).filter((s: any) => s.tenantId === tenantId);
      headers = ['id', 'admissionNumber', 'firstName', 'lastName', 'gender', 'dateOfBirth', 'status'];
    } else if (lower === 'teachers' || lower === 'staff') {
      data = Array.from(this.prisma.memoryStore.teachers.values()).filter((t: any) => t.tenantId === tenantId);
      headers = ['id', 'employeeNumber', 'firstName', 'lastName', 'email', 'designation', 'status'];
    } else if (lower === 'inventory' || lower === 'inventoryitems') {
      data = Array.from(this.prisma.memoryStore.inventoryItems.values()).filter((i: any) => i.tenantId === tenantId);
      headers = ['id', 'sku', 'name', 'category', 'unitOfMeasure', 'unitCost', 'quantityOnHand', 'status'];
    } else if (lower === 'assets' || lower === 'schoolassets') {
      data = Array.from(this.prisma.memoryStore.schoolAssets.values()).filter((a: any) => a.tenantId === tenantId);
      headers = ['id', 'assetTag', 'name', 'category', 'purchaseCost', 'currentBookValue', 'condition', 'status'];
    } else {
      data = Array.from(this.prisma.memoryStore.students.values()).filter((s: any) => s.tenantId === tenantId);
      headers = ['id', 'admissionNumber', 'firstName', 'lastName', 'status'];
    }

    return this.csvParser.stringify(headers, data);
  }

  async getExportJob(tenantId: string, jobId: string) {
    const job = this.prisma.memoryStore.dataExportJobs.get(jobId);
    if (!job || job.tenantId !== tenantId) {
      throw new NotFoundException(`Export job '${jobId}' not found`);
    }
    return job;
  }

  async listExportJobs(tenantId: string, filter?: ExportJobFilterDto) {
    let list = Array.from(this.prisma.memoryStore.dataExportJobs.values()).filter(
      (j: any) => j.tenantId === tenantId,
    );

    if (filter?.status) {
      list = list.filter((j: any) => j.status === filter.status);
    }
    if (filter?.format) {
      list = list.filter((j: any) => j.format === filter.format);
    }

    return list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
