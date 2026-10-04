import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateStudyMaterialDto,
  UpdateStudyMaterialDto,
  StudyMaterialFilterDto,
} from '../dto/study-material.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';
import { randomUUID } from 'crypto';

@Injectable()
export class StudyMaterialService {
  private readonly logger = new Logger(StudyMaterialService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createStudyMaterial(
    tenantId: string,
    teacherUserId: string,
    dto: CreateStudyMaterialDto,
  ) {
    const classRecord = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId },
    });
    if (!classRecord) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Class not found in this school',
      });
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, tenantId },
    });
    if (!subject) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Subject not found in this school',
      });
    }

    const id = `mat_${Date.now()}_${randomUUID().substring(0, 5)}`;
    const material = await this.prisma.studyMaterial.create({
      data: {
        id,
        tenantId,
        campusId: dto.campusId || classRecord.campusId || null,
        classId: dto.classId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId || classRecord.academicYearId || null,
        termId: dto.termId || null,
        uploadedByUserId: teacherUserId,
        title: dto.title,
        description: dto.description || null,
        topic: dto.topic || null,
        resourceType: dto.resourceType,
        fileUrl: dto.fileUrl || null,
        fileAssetId: dto.fileAssetId || null,
        externalUrl: dto.externalUrl || null,
        fileSizeBytes: dto.fileSizeBytes || null,
        mimeType: dto.mimeType || null,
        tags: (dto.tags as any) || [],
        visibilityScope: dto.visibilityScope || 'STUDENTS_AND_PARENTS',
        viewCount: 0,
        downloadCount: 0,
        isPublished: dto.isPublished ?? true,
      },
      include: {
        class: true,
        subject: true,
      },
    });

    return {
      ...material,
      className: classRecord.name,
      subjectName: subject.name,
    };
  }

  async getStudyMaterials(tenantId: string, filter: StudyMaterialFilterDto) {
    const where: any = { tenantId };

    if (filter.classId) where.classId = filter.classId;
    if (filter.subjectId) where.subjectId = filter.subjectId;
    if (filter.campusId) where.campusId = filter.campusId;
    if (filter.topic) where.topic = { contains: filter.topic, mode: 'insensitive' };
    if (filter.resourceType) where.resourceType = filter.resourceType;
    if (filter.visibilityScope) where.visibilityScope = filter.visibilityScope;
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const list = await this.prisma.studyMaterial.findMany({
      where,
      include: {
        class: true,
        subject: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map((m) => ({
      ...m,
      className: m.class?.name || 'Class',
      subjectName: m.subject?.name || 'Subject',
    }));
  }

  async getStudyMaterialById(tenantId: string, id: string, incrementView: boolean = true) {
    const material = await this.prisma.studyMaterial.findFirst({
      where: { id, tenantId },
      include: {
        class: true,
        subject: true,
      },
    });

    if (!material) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Study material not found',
      });
    }

    if (incrementView) {
      await this.prisma.studyMaterial.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
      material.viewCount += 1;
    }

    return {
      ...material,
      className: material.class?.name || 'Class',
      subjectName: material.subject?.name || 'Subject',
    };
  }

  async recordDownload(tenantId: string, id: string) {
    const material = await this.getStudyMaterialById(tenantId, id, false);
    const updated = await this.prisma.studyMaterial.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });

    return {
      id: updated.id,
      downloadCount: updated.downloadCount,
      fileUrl: updated.fileUrl || updated.externalUrl,
    };
  }

  async updateStudyMaterial(tenantId: string, id: string, dto: UpdateStudyMaterialDto) {
    const existing = await this.prisma.studyMaterial.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Study material not found',
      });
    }

    const updated = await this.prisma.studyMaterial.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
        ...(dto.resourceType !== undefined ? { resourceType: dto.resourceType } : {}),
        ...(dto.fileUrl !== undefined ? { fileUrl: dto.fileUrl } : {}),
        ...(dto.externalUrl !== undefined ? { externalUrl: dto.externalUrl } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags as any } : {}),
        ...(dto.visibilityScope !== undefined ? { visibilityScope: dto.visibilityScope } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
      },
      include: {
        class: true,
        subject: true,
      },
    });

    return {
      ...updated,
      className: updated.class?.name || 'Class',
      subjectName: updated.subject?.name || 'Subject',
    };
  }

  async deleteStudyMaterial(tenantId: string, id: string) {
    const existing = await this.prisma.studyMaterial.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Study material not found',
      });
    }

    await this.prisma.studyMaterial.delete({
      where: { id },
    });

    return { success: true, message: 'Study material removed successfully' };
  }
}
