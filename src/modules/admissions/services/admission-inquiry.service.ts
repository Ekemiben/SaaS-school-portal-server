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
    const inquiry = await this.prisma.admissionInquiry.create({
      data: {
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
      },
    });

    this.logger.log(`Created admission inquiry ${id} for tenant ${tenantId}`);
    return inquiry;
  }

  async listInquiries(tenantId: string, filter?: AdmissionInquiryFilterDto) {
    const where: any = {
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
    };

    return this.prisma.admissionInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInquiryById(tenantId: string, id: string) {
    const found = await this.prisma.admissionInquiry.findFirst({
      where: { id, tenantId },
    });
    if (!found) {
      throw new NotFoundException(`Admission inquiry ${id} not found`);
    }
    return found;
  }

  async updateInquiry(tenantId: string, id: string, dto: UpdateAdmissionInquiryDto) {
    await this.getInquiryById(tenantId, id);

    const updated = await this.prisma.admissionInquiry.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.followUpNotes !== undefined ? { followUpNotes: dto.followUpNotes } : {}),
        ...(dto.convertedAppId ? { convertedAppId: dto.convertedAppId, status: 'CONVERTED' } : {}),
      },
    });

    return updated;
  }
}
