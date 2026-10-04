import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { EnrollFromOfferDto, DirectEnrollStudentDto } from '../dto/enroll-student.dto.js';

@Injectable()
export class StudentEnrollmentService {
  private readonly logger = new Logger(StudentEnrollmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateAdmissionNumber(tenantId: string, year = new Date().getFullYear()): Promise<string> {
    const count = await this.prisma.student.count({
      where: { tenantId },
    });
    return `SCH/${year}/${String(count + 1).padStart(4, '0')}`;
  }

  async previewNextAdmissionNumber(tenantId: string, academicYearId?: string): Promise<{ admissionNumber: string }> {
    let year = new Date().getFullYear();
    if (academicYearId) {
      const ay = await this.prisma.academicYear.findFirst({
        where: { id: academicYearId, tenantId },
      });
      if (ay?.name) {
        const match = ay.name.match(/\d{4}/);
        if (match) year = parseInt(match[0], 10);
      }
    }
    const admissionNumber = await this.generateAdmissionNumber(tenantId, year);
    return { admissionNumber };
  }

  async enrollFromOffer(tenantId: string, actorUserId: string, dto: EnrollFromOfferDto) {
    const offer = await this.prisma.admissionOffer.findFirst({
      where: { id: dto.offerId, tenantId },
    });
    if (!offer) {
      throw new NotFoundException(`Admission offer ${dto.offerId} not found`);
    }

    if (offer.status !== 'ACCEPTED') {
      throw new BadRequestException(`Cannot enroll student: Offer ${offer.offerNumber} is currently "${offer.status}". Must be "ACCEPTED" with acceptance fee verified.`);
    }

    const application = await this.prisma.admissionApplication.findFirst({
      where: { id: offer.applicationId, tenantId },
    });
    if (!application) {
      throw new NotFoundException(`Application ${offer.applicationId} not found`);
    }

    const targetClass = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId },
    });
    if (!targetClass) {
      throw new NotFoundException(`Target class ${dto.classId} not found in this school`);
    }

    const admissionNumber = dto.customAdmissionNumber || (await this.generateAdmissionNumber(tenantId));
    const existingNumber = await this.prisma.student.findFirst({
      where: { tenantId, admissionNumber },
    });
    if (existingNumber) {
      throw new ConflictException(`Admission number "${admissionNumber}" is already in use.`);
    }

    const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = await this.prisma.student.create({
      data: {
        id: studentId,
        tenantId,
        campusId: offer.campusId,
        admissionNumber,
        firstName: application.studentFirstName,
        middleName: application.studentMiddleName || null,
        lastName: application.studentLastName,
        gender: application.gender,
        dateOfBirth: application.dateOfBirth ? new Date(application.dateOfBirth) : null,
        bloodGroup: application.bloodGroup || null,
        email: application.parentEmail || null,
        phone: application.parentPhone || null,
        address: application.parentAddress || null,
        photoUrl: null,
        status: 'ACTIVE',
      },
    });

    // 2. Link or Create Parent
    let parent = null;
    if (application.parentPhone) {
      parent = await this.prisma.parent.findFirst({
        where: { tenantId, phone: application.parentPhone },
      });
    }

    if (!parent) {
      const parentId = `prt_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      parent = await this.prisma.parent.create({
        data: {
          id: parentId,
          tenantId,
          firstName: application.parentFirstName,
          lastName: application.parentLastName,
          email: application.parentEmail || null,
          phone: application.parentPhone || '0000000000',
          relationship: application.parentRelationship || 'Parent',
          occupation: null,
          address: application.parentAddress || null,
        },
      });
    }

    const studentParent = await this.prisma.studentParent.upsert({
      where: {
        studentId_parentId: {
          studentId: student.id,
          parentId: parent.id,
        },
      },
      create: {
        id: `sp_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        studentId: student.id,
        parentId: parent.id,
        relationship: application.parentRelationship || 'Parent',
        isPrimaryContact: true,
        isEmergencyContact: true,
        canPickup: true,
        isFinancialGuarantor: true,
      },
      update: {},
    });

    // 3. Create Initial Academic Enrollment
    const enrollment = await this.prisma.enrollment.create({
      data: {
        id: `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        tenantId,
        studentId: student.id,
        classId: dto.classId,
        academicYearId: offer.academicYearId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    // 4. Record Lifecycle Event
    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
        id: `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        tenantId,
        studentId: student.id,
        eventType: 'ENROLLMENT',
        fromCampusId: null,
        toCampusId: offer.campusId,
        fromClassId: null,
        toClassId: dto.classId,
        fromAcademicYearId: null,
        toAcademicYearId: offer.academicYearId,
        reason: 'Admitted from Online Application',
        notes: dto.notes || `Admitted via Offer ${offer.offerNumber} (App: ${application.applicationNumber})`,
        actorUserId,
        effectiveDate: new Date(),
      },
    });

    // 5. Update Offer and Application Status
    await this.prisma.admissionOffer.update({
      where: { id: offer.id },
      data: { status: 'ENROLLED' },
    });

    await this.prisma.admissionApplication.update({
      where: { id: application.id },
      data: {
        status: 'ACCEPTED',
        internalNotes: `${application.internalNotes || ''}\nEnrolled as ${admissionNumber} (ID: ${student.id})`.trim(),
      },
    });

    this.logger.log(`Student ${admissionNumber} (${student.id}) enrolled from offer ${offer.offerNumber}`);
    return {
      student,
      enrollment,
      parent,
      studentParent,
      admissionNumber,
      lifecycleEvent,
    };
  }

  async directEnroll(tenantId: string, actorUserId: string, dto: DirectEnrollStudentDto) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: dto.campusId, tenantId },
    });
    if (!campus) {
      throw new NotFoundException(`Campus ${dto.campusId} not found in this school`);
    }

    const targetClass = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId },
    });
    if (!targetClass) {
      throw new NotFoundException(`Class ${dto.classId} not found in this school`);
    }

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, tenantId },
    });
    if (!academicYear) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found in this school`);
    }

    const admissionNumber = dto.customAdmissionNumber || dto.admissionNumber || (await this.generateAdmissionNumber(tenantId));
    const existingNumber = await this.prisma.student.findFirst({
      where: { tenantId, admissionNumber },
    });
    if (existingNumber) {
      throw new ConflictException(`Admission number "${admissionNumber}" is already in use.`);
    }

    const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = await this.prisma.student.create({
      data: {
        id: studentId,
        tenantId,
        campusId: dto.campusId,
        admissionNumber,
        firstName: dto.firstName.trim(),
        middleName: dto.middleName ? dto.middleName.trim() : null,
        lastName: dto.lastName.trim(),
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        bloodGroup: dto.bloodGroup || null,
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        phone: dto.phone || null,
        address: dto.address || null,
        photoUrl: null,
        status: 'ACTIVE',
      },
    });

    // Parent
    const parentPhone = dto.parentPhone ? dto.parentPhone.trim() : null;
    let parent = null;
    if (parentPhone) {
      parent = await this.prisma.parent.findFirst({
        where: { tenantId, phone: parentPhone },
      });
    }

    if (!parent) {
      const parentId = `prt_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      parent = await this.prisma.parent.create({
        data: {
          id: parentId,
          tenantId,
          firstName: dto.parentFirstName ? dto.parentFirstName.trim() : '',
          lastName: dto.parentLastName ? dto.parentLastName.trim() : '',
          email: dto.parentEmail ? dto.parentEmail.trim().toLowerCase() : null,
          phone: parentPhone || '0000000000',
          relationship: dto.parentRelationship || 'Parent',
          occupation: null,
          address: dto.parentAddress || null,
        },
      });
    }

    const studentParent = await this.prisma.studentParent.upsert({
      where: {
        studentId_parentId: {
          studentId: student.id,
          parentId: parent.id,
        },
      },
      create: {
        id: `sp_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        studentId: student.id,
        parentId: parent.id,
        relationship: dto.parentRelationship || 'Parent',
        isPrimaryContact: true,
        isEmergencyContact: true,
        canPickup: true,
        isFinancialGuarantor: true,
      },
      update: {},
    });

    const enrollment = await this.prisma.enrollment.create({
      data: {
        id: `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        tenantId,
        studentId: student.id,
        classId: dto.classId,
        academicYearId: dto.academicYearId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    });

    const lifecycleEvent = await this.prisma.studentLifecycleEvent.create({
      data: {
        id: `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
        tenantId,
        studentId: student.id,
        eventType: 'ENROLLMENT',
        fromCampusId: null,
        toCampusId: dto.campusId,
        fromClassId: null,
        toClassId: dto.classId,
        fromAcademicYearId: null,
        toAcademicYearId: dto.academicYearId,
        reason: 'Direct Administrative Enrollment',
        notes: dto.notes || 'Direct registration by school administration',
        actorUserId,
        effectiveDate: new Date(),
      },
    });

    this.logger.log(`Direct enrolled student ${admissionNumber} (${student.id}) by ${actorUserId}`);
    return {
      student,
      enrollment,
      parent,
      studentParent,
      lifecycleEvent,
    };
  }
}
