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
    const app = await this.prisma.admissionApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!app) {
      throw new NotFoundException(`Application ${applicationId} not found`);
    }

    const id = `doc_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const storageKey =
      dto.storageKey ||
      `tenants/${tenantId}/admissions/${applicationId}/${dto.documentType.toLowerCase()}_${Date.now()}_${dto.originalName}`;

    const document = await this.prisma.admissionApplicationDocument.create({
      data: {
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
      },
    });

    this.logger.log(`Attached document ${id} (${dto.documentType}) to application ${applicationId}`);
    return document;
  }

  async verifyDocument(
    tenantId: string,
    documentId: string,
    verifiedByUserId: string,
    dto: VerifyAdmissionDocumentDto,
  ) {
    const doc = await this.prisma.admissionApplicationDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    const updated = await this.prisma.admissionApplicationDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        verifiedByUserId: dto.status === 'VERIFIED' ? verifiedByUserId : null,
        rejectionNotes: dto.rejectionNotes || null,
      },
    });

    this.logger.log(`Document ${documentId} status updated to ${dto.status}`);
    return updated;
  }

  async listDocuments(tenantId: string, applicationId: string) {
    const app = await this.prisma.admissionApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!app) {
      throw new NotFoundException(`Application ${applicationId} not found`);
    }

    return this.prisma.admissionApplicationDocument.findMany({
      where: { tenantId, applicationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentById(tenantId: string, documentId: string) {
    const doc = await this.prisma.admissionApplicationDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    return doc;
  }
}
