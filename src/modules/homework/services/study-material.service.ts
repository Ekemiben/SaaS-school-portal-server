import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateStudyMaterialDto,
  UpdateStudyMaterialDto,
  StudyMaterialFilterDto,
} from '../dto/study-material.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class StudyMaterialService {
  private readonly logger = new Logger(StudyMaterialService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createStudyMaterial(
    tenantId: string,
    teacherUserId: string,
    dto: CreateStudyMaterialDto,
  ) {
    const classRecord = this.prisma.memoryStore.classes.get(dto.classId);
    if (!classRecord || classRecord.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Class not found in this school',
      });
    }

    const subject = this.prisma.memoryStore.subjects.get(dto.subjectId);
    if (!subject || subject.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Subject not found in this school',
      });
    }

    const id = `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const material = {
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
      tags: dto.tags || [],
      visibilityScope: dto.visibilityScope || 'STUDENTS_AND_PARENTS',
      viewCount: 0,
      downloadCount: 0,
      isPublished: dto.isPublished ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.studyMaterials.set(id, material);

    return {
      ...material,
      className: classRecord.name,
      subjectName: subject.name,
    };
  }

  async getStudyMaterials(tenantId: string, filter: StudyMaterialFilterDto) {
    let list = Array.from(this.prisma.memoryStore.studyMaterials.values()).filter(
      (m) => m.tenantId === tenantId,
    );

    if (filter.classId) {
      list = list.filter((m) => m.classId === filter.classId);
    }
    if (filter.subjectId) {
      list = list.filter((m) => m.subjectId === filter.subjectId);
    }
    if (filter.campusId) {
      list = list.filter((m) => m.campusId === filter.campusId);
    }
    if (filter.topic) {
      list = list.filter((m) => m.topic?.toLowerCase().includes(filter.topic!.toLowerCase()));
    }
    if (filter.resourceType) {
      list = list.filter((m) => m.resourceType === filter.resourceType);
    }
    if (filter.visibilityScope) {
      list = list.filter((m) => m.visibilityScope === filter.visibilityScope);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q) ||
          m.tags?.some((t: string) => t.toLowerCase().includes(q)),
      );
    }

    return list
      .map((m) => {
        const cls = this.prisma.memoryStore.classes.get(m.classId);
        const sub = this.prisma.memoryStore.subjects.get(m.subjectId);
        return {
          ...m,
          className: cls?.name || 'Class',
          subjectName: sub?.name || 'Subject',
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getStudyMaterialById(tenantId: string, id: string, incrementView: boolean = true) {
    const material = this.prisma.memoryStore.studyMaterials.get(id);
    if (!material || material.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Study material not found',
      });
    }

    if (incrementView) {
      material.viewCount = (material.viewCount || 0) + 1;
      this.prisma.memoryStore.studyMaterials.set(id, material);
    }

    const cls = this.prisma.memoryStore.classes.get(material.classId);
    const sub = this.prisma.memoryStore.subjects.get(material.subjectId);

    return {
      ...material,
      className: cls?.name || 'Class',
      subjectName: sub?.name || 'Subject',
    };
  }

  async recordDownload(tenantId: string, id: string) {
    const material = await this.getStudyMaterialById(tenantId, id, false);
    material.downloadCount = (material.downloadCount || 0) + 1;
    this.prisma.memoryStore.studyMaterials.set(id, material);

    return {
      id: material.id,
      downloadCount: material.downloadCount,
      fileUrl: material.fileUrl || material.externalUrl,
    };
  }

  async updateStudyMaterial(tenantId: string, id: string, dto: UpdateStudyMaterialDto) {
    const material = await this.getStudyMaterialById(tenantId, id, false);

    if (dto.title !== undefined) material.title = dto.title;
    if (dto.description !== undefined) material.description = dto.description;
    if (dto.topic !== undefined) material.topic = dto.topic;
    if (dto.resourceType !== undefined) material.resourceType = dto.resourceType;
    if (dto.fileUrl !== undefined) material.fileUrl = dto.fileUrl;
    if (dto.externalUrl !== undefined) material.externalUrl = dto.externalUrl;
    if (dto.tags !== undefined) material.tags = dto.tags;
    if (dto.visibilityScope !== undefined) material.visibilityScope = dto.visibilityScope;
    if (dto.isPublished !== undefined) material.isPublished = dto.isPublished;

    material.updatedAt = new Date();
    this.prisma.memoryStore.studyMaterials.set(id, material);

    return material;
  }

  async deleteStudyMaterial(tenantId: string, id: string) {
    await this.getStudyMaterialById(tenantId, id, false);
    this.prisma.memoryStore.studyMaterials.delete(id);
    return { success: true, message: 'Study material removed successfully' };
  }
}
