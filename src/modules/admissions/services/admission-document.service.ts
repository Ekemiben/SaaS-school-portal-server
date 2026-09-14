import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { UploadAdmissionDocumentDto, VerifyAdmissionDocumentDto } from '../dto/admission-document.dto.js';
import { FilesService } from '../../files/files.service.js';

@Injectable()
export class AdmissionDocumentService {
  private readonly logger = new Logger(AdmissionDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async attachDocument(
    tenantId: string,
    applicationId: string,
    dto: UploadAdmissionDocumentDto,
  ) {
    const app = this.prisma.memoryStore.admissionApplications.get(applicationId);
    if (!app || app.tenantId !== tenantId) {
      throw new NotFoundException(`Application ${applicationId} not found`);
    }

    const id = `doc_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const storageKey =
      dto.storageKey ||
      `tenants/${tenantId}/admissions/${applicationId}/${dto.documentType.toLowerCase()}_${Date.now()}_${dto.originalName}`;

    const document = {
      id,
      tenantId,
      applicationId,
      documentType: dto.documentType,
      fileAssetId: dto.fileAssetId || null,
      storageKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      status: 'PENDING',
      verifiedByUserId: null,
      rejectionNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionApplicationDocument) {
      try {
        await (this.prisma as any).admissionApplicationDocument.create({ data: document });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionApplicationDocument failed: ${err.message}`);
      }
    }

    this.prisma.memoryStore.admissionApplicationDocuments.set(id, document);
    this.logger.log(`Attached document ${id} (${dto.documentType}) to application ${applicationId}`);
    return document;
  }

  async verifyDocument(
    tenantId: string,
    documentId: string,
    verifiedByUserId: string,
    dto: VerifyAdmissionDocumentDto,
  ) {
    const doc = this.prisma.memoryStore.admissionApplicationDocuments.get(documentId);
    if (!doc || doc.tenantId !== tenantId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    const updated = {
      ...doc,
      status: dto.status,
      verifiedByUserId: dto.status === 'VERIFIED' ? verifiedByUserId : null,
      rejectionNotes: dto.rejectionNotes || null,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionApplicationDocuments.set(documentId, updated);
    this.logger.log(`Document ${documentId} status updated to ${dto.status}`);
    return updated;
  }

  async listDocuments(tenantId: string, applicationId: string) {
    const app = this.prisma.memoryStore.admissionApplications.get(applicationId);
    if (!app || app.tenantId !== tenantId) {
      throw new NotFoundException(`Application ${applicationId} not found`);
    }

    return Array.from(this.prisma.memoryStore.admissionApplicationDocuments.values()).filter(
      (d: any) => d.tenantId === tenantId && d.applicationId === applicationId,
    );
  }

  async getDocumentById(tenantId: string, documentId: string) {
    const doc = this.prisma.memoryStore.admissionApplicationDocuments.get(documentId);
    if (!doc || doc.tenantId !== tenantId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    return doc;
  }
}
