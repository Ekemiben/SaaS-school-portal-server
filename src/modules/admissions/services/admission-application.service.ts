import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import {
  CreateAdmissionApplicationDto,
  UpdateAdmissionApplicationDto,
  TransitionApplicationStatusDto,
  AssignReviewerDto,
  AdmissionApplicationFilterDto,
} from '../dto/admission-application.dto.js';
import { AdmissionInquiryService } from './admission-inquiry.service.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'SCREENING', 'ENTRANCE_TEST', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SCREENING', 'ENTRANCE_TEST', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['UNDER_REVIEW', 'ENTRANCE_TEST', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  ENTRANCE_TEST: ['UNDER_REVIEW', 'SCREENING', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['UNDER_REVIEW', 'SCREENING', 'ENTRANCE_TEST', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  OFFERED: ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  ACCEPTED: ['WITHDRAWN'],
  REJECTED: ['UNDER_REVIEW'],
  WITHDRAWN: ['DRAFT', 'SUBMITTED'],
  EXPIRED: ['OFFERED'],
};

@Injectable()
export class AdmissionApplicationService {
  private readonly logger = new Logger(AdmissionApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inquiryService: AdmissionInquiryService,
  ) {}

  async createApplication(tenantId: string, dto: CreateAdmissionApplicationDto, isPublic = false) {
    const year = new Date().getFullYear();
    const count = this.prisma.memoryStore.admissionApplications.size + 1;
    const applicationNumber = `ADM-${year}-${String(count).padStart(4, '0')}`;
    const id = `app_${randomUUID().replace(/-/g, '').substring(0, 12)}`;

    const application = {
      id,
      tenantId,
      campusId: dto.campusId,
      academicYearId: dto.academicYearId,
      applicationNumber,
      gradeLevel: dto.gradeLevel,
      studentFirstName: dto.studentFirstName.trim(),
      studentMiddleName: dto.studentMiddleName ? dto.studentMiddleName.trim() : null,
      studentLastName: dto.studentLastName.trim(),
      dateOfBirth: new Date(dto.dateOfBirth),
      gender: dto.gender,
      bloodGroup: dto.bloodGroup || null,
      previousSchool: dto.previousSchool || null,
      previousGrade: dto.previousGrade || null,
      parentFirstName: dto.parentFirstName.trim(),
      parentLastName: dto.parentLastName.trim(),
      parentEmail: dto.parentEmail.trim().toLowerCase(),
      parentPhone: dto.parentPhone.trim(),
      parentRelationship: dto.parentRelationship || 'Parent',
      parentAddress: dto.parentAddress || null,
      emergencyContactName: dto.emergencyContactName || null,
      emergencyContactPhone: dto.emergencyContactPhone || null,
      status: isPublic ? 'SUBMITTED' : 'DRAFT',
      reviewerUserId: null,
      internalNotes: null,
      rejectionReason: null,
      submittedAt: isPublic ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.prisma.isDbConnected && (this.prisma as any).admissionApplication) {
      try {
        await (this.prisma as any).admissionApplication.create({ data: application });
      } catch (err: any) {
        this.logger.warn(`Prisma create admissionApplication failed: ${err.message}. Using memory store.`);
      }
    }

    this.prisma.memoryStore.admissionApplications.set(id, application);

    if (dto.inquiryId) {
      try {
        await this.inquiryService.updateInquiry(tenantId, dto.inquiryId, { convertedAppId: id });
      } catch (err: any) {
        this.logger.warn(`Could not link inquiry ${dto.inquiryId}: ${err.message}`);
      }
    }

    this.logger.log(`Created application ${applicationNumber} (${id}) for tenant ${tenantId}`);
    return application;
  }

  async listApplications(tenantId: string, filter?: AdmissionApplicationFilterDto) {
    let list = Array.from(this.prisma.memoryStore.admissionApplications.values()).filter(
      (app: any) => app.tenantId === tenantId,
    );

    if (filter?.campusId) list = list.filter((app: any) => app.campusId === filter.campusId);
    if (filter?.academicYearId) list = list.filter((app: any) => app.academicYearId === filter.academicYearId);
    if (filter?.gradeLevel) list = list.filter((app: any) => app.gradeLevel === filter.gradeLevel);
    if (filter?.status) list = list.filter((app: any) => app.status === filter.status);
    if (filter?.reviewerUserId) list = list.filter((app: any) => app.reviewerUserId === filter.reviewerUserId);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (app: any) =>
          app.applicationNumber.toLowerCase().includes(q) ||
          app.studentFirstName.toLowerCase().includes(q) ||
          app.studentLastName.toLowerCase().includes(q) ||
          app.parentEmail.toLowerCase().includes(q) ||
          app.parentPhone.includes(q),
      );
    }

    return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getApplicationById(tenantId: string, id: string) {
    const app = this.prisma.memoryStore.admissionApplications.get(id);
    if (!app || app.tenantId !== tenantId) {
      throw new NotFoundException(`Admission application ${id} not found`);
    }

    const documents = Array.from(this.prisma.memoryStore.admissionApplicationDocuments.values()).filter(
      (d: any) => d.tenantId === tenantId && d.applicationId === id,
    );
    const screenings = Array.from(this.prisma.memoryStore.admissionScreenings.values()).filter(
      (s: any) => s.tenantId === tenantId && s.applicationId === id,
    );
    const entranceTests = Array.from(this.prisma.memoryStore.admissionEntranceTests.values()).filter(
      (t: any) => t.tenantId === tenantId && t.applicationId === id,
    );
    const interviews = Array.from(this.prisma.memoryStore.admissionInterviews.values()).filter(
      (i: any) => i.tenantId === tenantId && i.applicationId === id,
    );
    const decisions = Array.from(this.prisma.memoryStore.admissionDecisions.values()).filter(
      (dec: any) => dec.tenantId === tenantId && dec.applicationId === id,
    );
    const offers = Array.from(this.prisma.memoryStore.admissionOffers.values()).filter(
      (o: any) => o.tenantId === tenantId && o.applicationId === id,
    );

    return {
      ...app,
      documents,
      screenings,
      entranceTests,
      interviews,
      decisions,
      offers,
    };
  }

  async getApplicationByNumber(tenantId: string, applicationNumber: string) {
    const app = Array.from(this.prisma.memoryStore.admissionApplications.values()).find(
      (a: any) => a.tenantId === tenantId && a.applicationNumber === applicationNumber,
    );
    if (!app) {
      throw new NotFoundException(`Application ${applicationNumber} not found`);
    }
    return this.getApplicationById(tenantId, app.id);
  }

  async updateApplication(tenantId: string, id: string, dto: UpdateAdmissionApplicationDto) {
    const app = await this.getApplicationById(tenantId, id);
    if (app.status !== 'DRAFT' && app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(`Cannot edit application in ${app.status} state.`);
    }

    const updated = {
      ...app,
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : app.dateOfBirth,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionApplications.set(id, updated);
    return updated;
  }

  async transitionStatus(tenantId: string, id: string, dto: TransitionApplicationStatusDto) {
    const app = await this.getApplicationById(tenantId, id);
    const allowed = VALID_TRANSITIONS[app.status] || [];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from "${app.status}" to "${dto.status}". Allowed: [${allowed.join(', ')}]`,
      );
    }

    const updated = {
      ...app,
      status: dto.status,
      internalNotes: dto.internalNotes ? `${app.internalNotes || ''}\n${dto.internalNotes}`.trim() : app.internalNotes,
      rejectionReason: dto.rejectionReason || app.rejectionReason,
      submittedAt: dto.status === 'SUBMITTED' && !app.submittedAt ? new Date() : app.submittedAt,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionApplications.set(id, updated);
    this.logger.log(`Application ${id} transitioned from ${app.status} to ${dto.status}`);
    return updated;
  }

  async assignReviewer(tenantId: string, id: string, dto: AssignReviewerDto) {
    const app = await this.getApplicationById(tenantId, id);
    const updated = {
      ...app,
      reviewerUserId: dto.reviewerUserId,
      internalNotes: dto.notes ? `${app.internalNotes || ''}\nAssigned: ${dto.notes}`.trim() : app.internalNotes,
      status: app.status === 'SUBMITTED' ? 'UNDER_REVIEW' : app.status,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionApplications.set(id, updated);
    return updated;
  }

  async addInternalNote(tenantId: string, id: string, note: string) {
    const app = await this.getApplicationById(tenantId, id);
    const timestamp = new Date().toISOString();
    const formattedNote = `[${timestamp}] ${note}`;
    const updated = {
      ...app,
      internalNotes: app.internalNotes ? `${app.internalNotes}\n${formattedNote}` : formattedNote,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.admissionApplications.set(id, updated);
    return updated;
  }
}
