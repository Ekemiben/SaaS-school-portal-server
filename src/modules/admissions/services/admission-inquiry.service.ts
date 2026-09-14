import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateAdmissionInquiryDto,
  UpdateAdmissionInquiryDto,
  AdmissionInquiryFilterDto,
} from '../dto/admission-inquiry.dto.js';

@Injectable()
export class AdmissionInquiryService {
  private readonly logger = new Logger(AdmissionInquiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createInquiry(tenantId: string, dto: CreateAdmissionInquiryDto) {
    const id = `inq_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const inquiry = {
      id,
      tenantId,
      campusId: dto.campusId || null,
      desiredAcademicYearId: dto.desiredAcademicYearId || null,
      applicantName: dto.applicantName.trim(),
      parentName: dto.parentName.trim(),
      parentEmail: dto.parentEmail ? dto.parentEmail.trim().toLowerCase() : null,
      parentPhone: dto.parentPhone.trim(),
      desiredGradeLevel: dto.desiredGradeLevel || null,
      channel: dto.channel || 'ONLINE',
      source: dto.source || null,
      message: dto.message || null,
      status: 'NEW',
      followUpNotes: null,
      convertedAppId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionInquiry) {
      try {
        return await (this.prisma as any).admissionInquiry.create({ data: inquiry });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionInquiry failed: ${err.message}. Using memory store.`);
      }
    }

    this.prisma.memoryStore.admissionInquiries.set(id, inquiry);
    this.logger.log(`Created admission inquiry ${id} for tenant ${tenantId}`);
    return inquiry;
  }

  async listInquiries(tenantId: string, filter?: AdmissionInquiryFilterDto) {
    if (this.prisma.isDbConnected && (this.prisma as any).admissionInquiry) {
      try {
        return await (this.prisma as any).admissionInquiry.findMany({
          where: {
            tenantId,
            ...(filter?.campusId ? { campusId: filter.campusId } : {}),
            ...(filter?.status ? { status: filter.status } : {}),
            ...(filter?.desiredGradeLevel ? { desiredGradeLevel: filter.desiredGradeLevel } : {}),
            ...(filter?.search
              ? {
                  OR: [
                    { applicantName: { contains: filter.search, mode: 'insensitive' } },
                    { parentName: { contains: filter.search, mode: 'insensitive' } },
                    { parentPhone: { contains: filter.search } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
      } catch (err: any) {
        this.logger.warn(`Prisma findMany admissionInquiries failed: ${err.message}`);
      }
    }

    let list = Array.from(this.prisma.memoryStore.admissionInquiries.values()).filter(
      (inq: any) => inq.tenantId === tenantId,
    );

    if (filter?.campusId) list = list.filter((inq: any) => inq.campusId === filter.campusId);
    if (filter?.status) list = list.filter((inq: any) => inq.status === filter.status);
    if (filter?.desiredGradeLevel) {
      list = list.filter((inq: any) => inq.desiredGradeLevel === filter.desiredGradeLevel);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (inq: any) =>
          inq.applicantName.toLowerCase().includes(q) ||
          inq.parentName.toLowerCase().includes(q) ||
          inq.parentPhone.includes(q),
      );
    }

    return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getInquiryById(tenantId: string, id: string) {
    if (this.prisma.isDbConnected && (this.prisma as any).admissionInquiry) {
      try {
        const found = await (this.prisma as any).admissionInquiry.findFirst({
          where: { id, tenantId },
        });
        if (found) return found;
      } catch {}
    }

    const inq = this.prisma.memoryStore.admissionInquiries.get(id);
    if (!inq || inq.tenantId !== tenantId) {
      throw new NotFoundException(`Admission inquiry ${id} not found`);
    }
    return inq;
  }

  async updateInquiry(tenantId: string, id: string, dto: UpdateAdmissionInquiryDto) {
    const existing = await this.getInquiryById(tenantId, id);

    const updated = {
      ...existing,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.followUpNotes !== undefined ? { followUpNotes: dto.followUpNotes } : {}),
      ...(dto.convertedAppId ? { convertedAppId: dto.convertedAppId, status: 'CONVERTED' } : {}),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionInquiry) {
      try {
        return await (this.prisma as any).admissionInquiry.update({
          where: { id },
          data: updated,
        });
      } catch {}
    }

    this.prisma.memoryStore.admissionInquiries.set(id, updated);
    return updated;
  }
}
