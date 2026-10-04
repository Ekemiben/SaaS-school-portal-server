import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { StudentsService } from '../../students/students.service.js';
import { randomUUID } from 'crypto';
import {
  CreateAdmissionApplicationDto,
  UpdateAdmissionApplicationDto,
  TransitionApplicationStatusDto,
  AssignReviewerDto,
  AdmissionApplicationFilterDto,
} from '../dto/admission-application.dto.js';
import { AdmissionInquiryService } from './admission-inquiry.service.js';

const STATUS_TO_DB: Record<string, string> = {
  'Submitted': 'SUBMITTED',
  'Under Review': 'UNDER_REVIEW',
  'Exam Scheduled': 'SCREENING',
  'Interviewed': 'INTERVIEW',
  'Offered Admission': 'OFFERED',
  'Accepted': 'ACCEPTED',
  'Enrolled': 'ENROLLED',
  'Rejected': 'REJECTED',
  'Withdrawn': 'WITHDRAWN',
  'Draft': 'DRAFT',
  'SUBMITTED': 'SUBMITTED',
  'UNDER_REVIEW': 'UNDER_REVIEW',
  'SCREENING': 'SCREENING',
  'ENTRANCE_TEST': 'ENTRANCE_TEST',
  'INTERVIEW': 'INTERVIEW',
  'OFFERED': 'OFFERED',
  'ACCEPTED': 'ACCEPTED',
  'ENROLLED': 'ENROLLED',
  'REJECTED': 'REJECTED',
  'WITHDRAWN': 'WITHDRAWN',
  'DRAFT': 'DRAFT',
  'EXPIRED': 'EXPIRED',
};

const DB_TO_STATUS: Record<string, string> = {
  'SUBMITTED': 'Submitted',
  'UNDER_REVIEW': 'Under Review',
  'SCREENING': 'Exam Scheduled',
  'ENTRANCE_TEST': 'Exam Scheduled',
  'INTERVIEW': 'Interviewed',
  'OFFERED': 'Offered Admission',
  'ACCEPTED': 'Enrolled',
  'ENROLLED': 'Enrolled',
  'REJECTED': 'Rejected',
  'WITHDRAWN': 'Withdrawn',
  'DRAFT': 'Submitted',
  'EXPIRED': 'Rejected',
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN', 'UNDER_REVIEW', 'ENROLLED'],
  SUBMITTED: ['UNDER_REVIEW', 'SCREENING', 'ENTRANCE_TEST', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SCREENING', 'ENTRANCE_TEST', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['UNDER_REVIEW', 'ENTRANCE_TEST', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'],
  ENTRANCE_TEST: ['UNDER_REVIEW', 'SCREENING', 'INTERVIEW', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['UNDER_REVIEW', 'SCREENING', 'ENTRANCE_TEST', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN'],
  OFFERED: ['ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  ACCEPTED: ['ENROLLED', 'WITHDRAWN', 'REJECTED'],
  ENROLLED: ['WITHDRAWN'],
  REJECTED: ['UNDER_REVIEW', 'SUBMITTED'],
  WITHDRAWN: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'],
  EXPIRED: ['OFFERED', 'UNDER_REVIEW'],
};

@Injectable()
export class AdmissionApplicationService {
  private readonly logger = new Logger(AdmissionApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inquiryService: AdmissionInquiryService,
    private readonly studentsService: StudentsService,
  ) {}

  private formatApplicationResponse(app: any) {
    if (!app) return null;
    const entranceTest = app.entranceTests?.[0];
    const interview = app.interviews?.[0];
    const decision = app.decisions?.[0];
    const offer = app.offers?.[0];

    const displayStatus = DB_TO_STATUS[app.status] || app.status;

    return {
      ...app,
      candidateName: `${app.studentFirstName || ''} ${app.studentLastName || ''}`.trim(),
      refNumber: app.applicationNumber,
      applyingClass: app.gradeLevel,
      parentName: `${app.parentFirstName || ''} ${app.parentLastName || ''}`.trim(),
      applicationDate: app.createdAt ? new Date(app.createdAt).toISOString().slice(0, 10) : '',
      dateOfBirth: app.dateOfBirth ? new Date(app.dateOfBirth).toISOString().slice(0, 10) : '',
      examScore: entranceTest?.scoreObtained ?? null,
      interviewScore: interview?.score ?? null,
      decisionNotes: decision?.decisionNotes || app.internalNotes || null,
      status: app.status,
      displayStatus,
      rawStatus: app.status,
    };
  }

  async createApplication(tenantId: string, dto: CreateAdmissionApplicationDto, isPublic = false) {
    // 1. Resolve Campus
    let campusId = dto.campusId;
    if (campusId) {
      const exists = await this.prisma.campus.findFirst({
        where: { id: campusId, tenantId },
      });
      if (!exists) campusId = undefined;
    }
    if (!campusId) {
      const mainCampus = (await this.prisma.campus.findFirst({
        where: { tenantId, isMain: true },
      })) || (await this.prisma.campus.findFirst({
        where: { tenantId },
      }));
      if (mainCampus) {
        campusId = mainCampus.id;
      } else {
        const newCampus = await this.prisma.campus.create({
          data: {
            id: `cmp_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            name: 'Main Campus',
            code: 'MAIN-01',
            isMain: true,
          },
        });
        campusId = newCampus.id;
      }
    }

    // 2. Resolve Academic Year
    let academicYearId = dto.academicYearId;
    if (academicYearId) {
      const exists = await this.prisma.academicYear.findFirst({
        where: { id: academicYearId, tenantId },
      });
      if (!exists) academicYearId = undefined;
    }
    if (!academicYearId) {
      const activeYear = (await this.prisma.academicYear.findFirst({
        where: { tenantId, isCurrent: true },
      })) || (await this.prisma.academicYear.findFirst({
        where: { tenantId },
      }));
      if (activeYear) {
        academicYearId = activeYear.id;
      } else {
        const yr = new Date().getFullYear();
        const newYear = await this.prisma.academicYear.create({
          data: {
            id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            name: `${yr}/${yr + 1}`,
            code: `AY-${yr}`,
            startDate: new Date(`${yr}-09-01`),
            endDate: new Date(`${yr + 1}-07-31`),
            isCurrent: true,
          },
        });
        academicYearId = newYear.id;
      }
    }

    // 3. Resolve Candidate Names
    let studentFirstName = (dto.studentFirstName || '').trim();
    let studentLastName = (dto.studentLastName || '').trim();
    if (!studentFirstName && dto.candidateName) {
      const parts = dto.candidateName.trim().split(/\s+/);
      studentFirstName = parts[0] || 'Candidate';
      studentLastName = parts.slice(1).join(' ') || 'Student';
    }
    if (!studentFirstName) studentFirstName = 'Prospective';
    if (!studentLastName) studentLastName = 'Candidate';

    // 4. Resolve Parent Names
    let parentFirstName = (dto.parentFirstName || '').trim();
    let parentLastName = (dto.parentLastName || '').trim();
    if (!parentFirstName && dto.parentName) {
      const parts = dto.parentName.trim().split(/\s+/);
      parentFirstName = parts[0] || 'Parent';
      parentLastName = parts.slice(1).join(' ') || 'Guardian';
    }
    if (!parentFirstName) parentFirstName = 'Parent';
    if (!parentLastName) parentLastName = 'Guardian';

    // 5. Resolve Gender & Grade Level
    let gender = (dto.gender || 'OTHER').toUpperCase();
    if (!['MALE', 'FEMALE'].includes(gender)) gender = 'OTHER';

    const gradeLevel = (dto.gradeLevel || dto.applyingClass || 'JSS 1').trim();

    // 6. Generate Application Number
    const year = new Date().getFullYear();
    const count = await this.prisma.admissionApplication.count({ where: { tenantId } });
    let applicationNumber = `ADM-${year}-${String(count + 1).padStart(4, '0')}`;
    const collision = await this.prisma.admissionApplication.findUnique({
      where: { tenantId_applicationNumber: { tenantId, applicationNumber } },
    });
    if (collision) {
      applicationNumber = `${applicationNumber}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // 7. Resolve Initial Status
    let initialStatus = isPublic ? 'SUBMITTED' : 'DRAFT';
    if (dto.status) {
      initialStatus = STATUS_TO_DB[dto.status] || dto.status.toUpperCase();
    }

    const id = `app_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const createdAt = dto.applicationDate ? new Date(dto.applicationDate) : new Date();

    const applicationData = {
      id,
      tenantId,
      campusId,
      academicYearId,
      applicationNumber,
      gradeLevel,
      studentFirstName,
      studentMiddleName: dto.studentMiddleName ? dto.studentMiddleName.trim() : null,
      studentLastName,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : new Date('2013-01-01'),
      gender,
      bloodGroup: dto.bloodGroup || null,
      previousSchool: dto.previousSchool || null,
      previousGrade: dto.previousGrade || null,
      parentFirstName,
      parentLastName,
      parentEmail: (dto.parentEmail || `parent.${randomUUID().slice(0, 6)}@tenant.school`).trim().toLowerCase(),
      parentPhone: (dto.parentPhone || '08000000000').trim(),
      parentRelationship: dto.parentRelationship || 'Parent',
      parentAddress: dto.parentAddress || null,
      emergencyContactName: dto.emergencyContactName || null,
      emergencyContactPhone: dto.emergencyContactPhone || null,
      status: initialStatus,
      reviewerUserId: null,
      internalNotes: dto.decisionNotes || null,
      rejectionReason: null,
      submittedAt: initialStatus !== 'DRAFT' ? new Date() : null,
      createdAt,
      updatedAt: new Date(),
    };

    await this.prisma.admissionApplication.create({ data: applicationData });

    // 8. Record Entrance Test score if provided
    if (dto.examScore !== undefined && dto.examScore !== null && dto.examScore !== '') {
      const examVal = Number(dto.examScore);
      try {
        await this.prisma.admissionEntranceTest.create({
          data: {
            id: `aet_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            applicationId: id,
            subject: 'Entrance Assessment',
            testDate: new Date(),
            maxScore: 100,
            scoreObtained: examVal,
            percentage: examVal,
            passMark: 50,
            outcome: examVal >= 50 ? 'PASSED' : 'FAILED',
            notes: dto.decisionNotes || null,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not save entrance test score: ${err.message}`);
      }
    }

    // 9. Record Interview score if provided
    if (dto.interviewScore !== undefined && dto.interviewScore !== null && dto.interviewScore !== '') {
      const oralVal = Number(dto.interviewScore);
      try {
        await this.prisma.admissionInterview.create({
          data: {
            id: `ai_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            applicationId: id,
            interviewDate: new Date(),
            interviewerUserId: 'admission_office',
            score: oralVal,
            outcome: oralVal >= 60 ? 'RECOMMENDED' : 'PENDING',
            evaluationNotes: dto.decisionNotes || null,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not save interview evaluation: ${err.message}`);
      }
    }

    if (dto.inquiryId) {
      try {
        await this.inquiryService.updateInquiry(tenantId, dto.inquiryId, { convertedAppId: id });
      } catch (err: any) {
        this.logger.warn(`Could not link inquiry ${dto.inquiryId}: ${err.message}`);
      }
    }

    this.logger.log(`Created application ${applicationNumber} (${id}) for tenant ${tenantId}`);

    // If status is immediately ENROLLED, convert candidate
    if (initialStatus === 'ENROLLED') {
      await this.enrollCandidate(tenantId, id);
    }

    return this.getApplicationById(tenantId, id);
  }

  async listApplications(tenantId: string, filter?: AdmissionApplicationFilterDto) {
    const where: any = { tenantId };
    if (filter?.campusId) where.campusId = filter.campusId;
    if (filter?.academicYearId) where.academicYearId = filter.academicYearId;
    if (filter?.gradeLevel) where.gradeLevel = filter.gradeLevel;
    if (filter?.status) {
      const mapped = STATUS_TO_DB[filter.status] || filter.status.toUpperCase();
      where.status = mapped;
    }
    if (filter?.reviewerUserId) where.reviewerUserId = filter.reviewerUserId;
    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { applicationNumber: { contains: q, mode: 'insensitive' } },
        { studentFirstName: { contains: q, mode: 'insensitive' } },
        { studentLastName: { contains: q, mode: 'insensitive' } },
        { parentEmail: { contains: q, mode: 'insensitive' } },
        { parentPhone: { contains: q } },
        { gradeLevel: { contains: q, mode: 'insensitive' } },
      ];
    }

    const apps = await this.prisma.admissionApplication.findMany({
      where,
      include: {
        documents: true,
        screenings: true,
        entranceTests: true,
        interviews: true,
        decisions: true,
        offers: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return apps.map((app) => this.formatApplicationResponse(app));
  }

  async getApplicationById(tenantId: string, id: string) {
    const app = await this.prisma.admissionApplication.findFirst({
      where: { id, tenantId },
      include: {
        documents: true,
        screenings: true,
        entranceTests: true,
        interviews: true,
        decisions: true,
        offers: true,
      },
    });
    if (!app) {
      throw new NotFoundException(`Admission application ${id} not found`);
    }

    return this.formatApplicationResponse(app);
  }

  async getApplicationByNumber(tenantIdOrSlug: string, applicationNumber: string) {
    let tenantId = tenantIdOrSlug;
    const tenant = await this.prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
    });
    if (tenant) tenantId = tenant.id;

    const app = await this.prisma.admissionApplication.findFirst({
      where: { tenantId, applicationNumber },
      include: {
        documents: true,
        screenings: true,
        entranceTests: true,
        interviews: true,
        decisions: true,
        offers: true,
      },
    });
    if (!app) {
      throw new NotFoundException(`Application ${applicationNumber} not found`);
    }
    return this.formatApplicationResponse(app);
  }

  async updateApplication(tenantId: string, id: string, dto: UpdateAdmissionApplicationDto) {
    const existing = await this.getApplicationById(tenantId, id);

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (dto.campusId) updateData.campusId = dto.campusId;
    if (dto.academicYearId) updateData.academicYearId = dto.academicYearId;
    if (dto.gradeLevel || dto.applyingClass) updateData.gradeLevel = dto.gradeLevel || dto.applyingClass;

    if (dto.studentFirstName) updateData.studentFirstName = dto.studentFirstName.trim();
    if (dto.studentMiddleName !== undefined) updateData.studentMiddleName = dto.studentMiddleName ? dto.studentMiddleName.trim() : null;
    if (dto.studentLastName) updateData.studentLastName = dto.studentLastName.trim();
    if (dto.candidateName && (!dto.studentFirstName || !dto.studentLastName)) {
      const parts = dto.candidateName.trim().split(/\s+/);
      updateData.studentFirstName = parts[0] || 'Candidate';
      updateData.studentLastName = parts.slice(1).join(' ') || 'Student';
    }

    if (dto.parentFirstName) updateData.parentFirstName = dto.parentFirstName.trim();
    if (dto.parentLastName) updateData.parentLastName = dto.parentLastName.trim();
    if (dto.parentName && (!dto.parentFirstName || !dto.parentLastName)) {
      const parts = dto.parentName.trim().split(/\s+/);
      updateData.parentFirstName = parts[0] || 'Parent';
      updateData.parentLastName = parts.slice(1).join(' ') || 'Guardian';
    }

    if (dto.dateOfBirth) updateData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender) {
      let g = dto.gender.toUpperCase();
      if (!['MALE', 'FEMALE'].includes(g)) g = 'OTHER';
      updateData.gender = g;
    }
    if (dto.bloodGroup !== undefined) updateData.bloodGroup = dto.bloodGroup;
    if (dto.previousSchool !== undefined) updateData.previousSchool = dto.previousSchool;
    if (dto.previousGrade !== undefined) updateData.previousGrade = dto.previousGrade;
    if (dto.parentEmail) updateData.parentEmail = dto.parentEmail.trim().toLowerCase();
    if (dto.parentPhone) updateData.parentPhone = dto.parentPhone.trim();
    if (dto.parentRelationship) updateData.parentRelationship = dto.parentRelationship;
    if (dto.parentAddress !== undefined) updateData.parentAddress = dto.parentAddress;
    if (dto.emergencyContactName !== undefined) updateData.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = dto.emergencyContactPhone;

    if (dto.decisionNotes !== undefined) {
      updateData.internalNotes = dto.decisionNotes;
    }

    let targetStatus = existing.rawStatus;
    if (dto.status) {
      targetStatus = STATUS_TO_DB[dto.status] || dto.status.toUpperCase();
      updateData.status = targetStatus;
    }

    await this.prisma.admissionApplication.update({
      where: { id },
      data: updateData,
    });

    // Update or create Entrance Test
    if (dto.examScore !== undefined && dto.examScore !== null && dto.examScore !== '') {
      const score = Number(dto.examScore);
      const existingTest = await this.prisma.admissionEntranceTest.findFirst({
        where: { applicationId: id, tenantId },
      });
      if (existingTest) {
        await this.prisma.admissionEntranceTest.update({
          where: { id: existingTest.id },
          data: {
            scoreObtained: score,
            percentage: score,
            outcome: score >= 50 ? 'PASSED' : 'FAILED',
            notes: dto.decisionNotes || existingTest.notes,
            updatedAt: new Date(),
          },
        });
      } else {
        await this.prisma.admissionEntranceTest.create({
          data: {
            id: `aet_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            applicationId: id,
            subject: 'Entrance Assessment',
            testDate: new Date(),
            maxScore: 100,
            scoreObtained: score,
            percentage: score,
            passMark: 50,
            outcome: score >= 50 ? 'PASSED' : 'FAILED',
            notes: dto.decisionNotes || null,
          },
        });
      }
    }

    // Update or create Interview
    if (dto.interviewScore !== undefined && dto.interviewScore !== null && dto.interviewScore !== '') {
      const score = Number(dto.interviewScore);
      const existingInterview = await this.prisma.admissionInterview.findFirst({
        where: { applicationId: id, tenantId },
      });
      if (existingInterview) {
        await this.prisma.admissionInterview.update({
          where: { id: existingInterview.id },
          data: {
            score,
            outcome: score >= 60 ? 'RECOMMENDED' : 'PENDING',
            evaluationNotes: dto.decisionNotes || existingInterview.evaluationNotes,
            updatedAt: new Date(),
          },
        });
      } else {
        await this.prisma.admissionInterview.create({
          data: {
            id: `ai_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            applicationId: id,
            interviewDate: new Date(),
            interviewerUserId: 'admission_office',
            score,
            outcome: score >= 60 ? 'RECOMMENDED' : 'PENDING',
            evaluationNotes: dto.decisionNotes || null,
          },
        });
      }
    }

    // If transitioned to ENROLLED, convert candidate
    if (targetStatus === 'ENROLLED' && existing.rawStatus !== 'ENROLLED') {
      await this.enrollCandidate(tenantId, id);
    }

    return this.getApplicationById(tenantId, id);
  }

  async transitionStatus(tenantId: string, id: string, dto: TransitionApplicationStatusDto) {
    const app = await this.getApplicationById(tenantId, id);
    const targetStatus = STATUS_TO_DB[dto.status] || dto.status.toUpperCase();

    const allowed = VALID_TRANSITIONS[app.rawStatus] || [];
    if (!allowed.includes(targetStatus) && targetStatus !== app.rawStatus) {
      throw new BadRequestException(
        `Invalid status transition from "${app.status}" (${app.rawStatus}) to "${dto.status}" (${targetStatus}). Allowed: [${allowed.join(', ')}]`,
      );
    }

    const updatePayload: any = {
      status: targetStatus,
      updatedAt: new Date(),
    };

    if (dto.internalNotes) {
      updatePayload.internalNotes = app.internalNotes ? `${app.internalNotes}\n${dto.internalNotes}`.trim() : dto.internalNotes;
    }
    if (dto.rejectionReason) {
      updatePayload.rejectionReason = dto.rejectionReason;
    }
    if (targetStatus === 'SUBMITTED' && !app.submittedAt) {
      updatePayload.submittedAt = new Date();
    }

    await this.prisma.admissionApplication.update({
      where: { id },
      data: updatePayload,
    });

    this.logger.log(`Application ${id} transitioned from ${app.rawStatus} to ${targetStatus}`);

    // If transitioned to ENROLLED, auto-convert candidate to Student
    if (targetStatus === 'ENROLLED' && app.rawStatus !== 'ENROLLED') {
      return this.enrollCandidate(tenantId, id);
    }

    return this.getApplicationById(tenantId, id);
  }

  async enrollCandidate(tenantId: string, id: string, enrollData?: any) {
    const app = await this.getApplicationById(tenantId, id);

    // Prepare student payload
    const studentPayload = {
      campusId: enrollData?.campusId || app.campusId,
      academicYearId: enrollData?.academicYearId || app.academicYearId,
      classLevel: enrollData?.classLevel || app.gradeLevel,
      classId: enrollData?.classId,
      firstName: app.studentFirstName,
      middleName: app.studentMiddleName || undefined,
      lastName: app.studentLastName,
      gender: app.gender === 'FEMALE' ? 'Female' : 'Male',
      dateOfBirth: app.dateOfBirth ? new Date(app.dateOfBirth).toISOString().slice(0, 10) : '2013-01-01',
      bloodGroup: app.bloodGroup || undefined,
      address: app.parentAddress || undefined,
      guardianName: `${app.parentFirstName} ${app.parentLastName}`.trim(),
      guardianRelationship: app.parentRelationship || 'Parent',
      guardianPhone: app.parentPhone,
      guardianEmail: app.parentEmail,
      guardianAddress: app.parentAddress || undefined,
      status: 'ACTIVE',
    };

    const student = await this.studentsService.create(tenantId, studentPayload);

    const enrollmentNote = `[ENROLLED] Student Record ID: ${student.id} (Admission No: ${student.admissionNumber || 'Assigned'}) on ${new Date().toISOString()}`;
    const newNotes = app.internalNotes ? `${app.internalNotes}\n${enrollmentNote}`.trim() : enrollmentNote;

    await this.prisma.admissionApplication.update({
      where: { id },
      data: {
        status: 'ENROLLED',
        internalNotes: newNotes,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Enrolled candidate from application ${app.refNumber} as student ${student.admissionNumber} (${student.id})`);

    const updatedApp = await this.getApplicationById(tenantId, id);
    return { application: updatedApp, student };
  }

  async deleteApplication(tenantId: string, id: string) {
    await this.getApplicationById(tenantId, id);

    await this.prisma.admissionApplication.delete({
      where: { id },
    });

    this.logger.log(`Deleted admission application ${id} for tenant ${tenantId}`);
    return { success: true, message: `Application ${id} deleted successfully` };
  }

  async assignReviewer(tenantId: string, id: string, dto: AssignReviewerDto) {
    const app = await this.getApplicationById(tenantId, id);
    const updatedNotes = dto.notes ? `${app.internalNotes || ''}\nAssigned: ${dto.notes}`.trim() : app.internalNotes;
    const targetStatus = app.rawStatus === 'SUBMITTED' ? 'UNDER_REVIEW' : app.rawStatus;

    await this.prisma.admissionApplication.update({
      where: { id },
      data: {
        reviewerUserId: dto.reviewerUserId,
        internalNotes: updatedNotes,
        status: targetStatus,
        updatedAt: new Date(),
      },
    });

    return this.getApplicationById(tenantId, id);
  }

  async addInternalNote(tenantId: string, id: string, note: string) {
    const app = await this.getApplicationById(tenantId, id);
    const timestamp = new Date().toISOString();
    const formattedNote = `[${timestamp}] ${note}`;
    const updatedNotes = app.internalNotes ? `${app.internalNotes}\n${formattedNote}` : formattedNote;

    await this.prisma.admissionApplication.update({
      where: { id },
      data: {
        internalNotes: updatedNotes,
        updatedAt: new Date(),
      },
    });

    return this.getApplicationById(tenantId, id);
  }
}
