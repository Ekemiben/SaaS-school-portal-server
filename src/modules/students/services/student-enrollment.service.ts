import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { randomUUID } from 'crypto';
import { EnrollFromOfferDto, DirectEnrollStudentDto } from '../dto/enroll-student.dto.js';

@Injectable()
export class StudentEnrollmentService {
  private readonly logger = new Logger(StudentEnrollmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  generateAdmissionNumber(tenantId: string, year = new Date().getFullYear()): string {
    const existing = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s: any) => s.tenantId === tenantId,
    );
    return `SCH/${year}/${String(existing.length + 1).padStart(4, '0')}`;
  }

  previewNextAdmissionNumber(tenantId: string, academicYearId?: string): { admissionNumber: string } {
    let year = new Date().getFullYear();
    if (academicYearId) {
      const ay = this.prisma.memoryStore.academicYears.get(academicYearId);
      if (ay?.name) {
        const match = ay.name.match(/\d{4}/);
        if (match) year = parseInt(match[0], 10);
      }
    }
    return { admissionNumber: this.generateAdmissionNumber(tenantId, year) };
  }

  async enrollFromOffer(tenantId: string, actorUserId: string, dto: EnrollFromOfferDto) {
    const offer = this.prisma.memoryStore.admissionOffers.get(dto.offerId);
    if (!offer || offer.tenantId !== tenantId) {
      throw new NotFoundException(`Admission offer ${dto.offerId} not found`);
    }

    if (offer.status !== 'ACCEPTED') {
      throw new BadRequestException(`Cannot enroll student: Offer ${offer.offerNumber} is currently "${offer.status}". Must be "ACCEPTED" with acceptance fee verified.`);
    }

    const application = this.prisma.memoryStore.admissionApplications.get(offer.applicationId);
    if (!application || application.tenantId !== tenantId) {
      throw new NotFoundException(`Application ${offer.applicationId} not found`);
    }

    const targetClass = this.prisma.memoryStore.classes.get(dto.classId);
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Target class ${dto.classId} not found in this school`);
    }

    const admissionNumber = dto.customAdmissionNumber || this.generateAdmissionNumber(tenantId);
    const existingNumber = Array.from(this.prisma.memoryStore.students.values()).find(
      (s: any) => s.tenantId === tenantId && s.admissionNumber === admissionNumber,
    );
    if (existingNumber) {
      throw new ConflictException(`Admission number "${admissionNumber}" is already in use.`);
    }

    const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.students.set(studentId, student);

    // 2. Link or Create Parent
    let parent = Array.from(this.prisma.memoryStore.parents.values()).find(
      (p: any) => p.tenantId === tenantId && p.phone === application.parentPhone,
    );
    if (!parent) {
      const parentId = `prt_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      parent = {
        id: parentId,
        tenantId,
        firstName: application.parentFirstName,
        lastName: application.parentLastName,
        email: application.parentEmail,
        phone: application.parentPhone,
        relationship: application.parentRelationship || 'Parent',
        occupation: null,
        address: application.parentAddress || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.parents.set(parentId, parent);
    }

    const studentParent = {
      id: `sp_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
      studentId,
      parentId: parent.id,
      relationship: application.parentRelationship || 'Parent',
      isPrimaryContact: true,
      isEmergencyContact: true,
      canPickup: true,
      isFinancialGuarantor: true,
    };
    this.prisma.memoryStore.studentParents.set(`${studentId}_${parent.id}`, studentParent);

    // 3. Create Initial Academic Enrollment
    const enrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const enrollment = {
      id: enrollmentId,
      tenantId,
      studentId,
      classId: dto.classId,
      academicYearId: offer.academicYearId,
      rollNumber: dto.rollNumber || null,
      status: 'ACTIVE',
      enrolledAt: new Date(),
    };
    this.prisma.memoryStore.enrollments.set(enrollmentId, enrollment);

    // 4. Record Lifecycle Event
    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
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
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    // 5. Update Offer and Application Status
    offer.status = 'ENROLLED';
    offer.updatedAt = new Date();
    this.prisma.memoryStore.admissionOffers.set(offer.id, offer);

    application.status = 'ACCEPTED';
    application.internalNotes = `${application.internalNotes || ''}\nEnrolled as ${admissionNumber} (ID: ${studentId})`.trim();
    application.updatedAt = new Date();
    this.prisma.memoryStore.admissionApplications.set(application.id, application);

    this.logger.log(`Student ${admissionNumber} (${studentId}) enrolled from offer ${offer.offerNumber}`);
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
    const campus = this.prisma.memoryStore.campuses.get(dto.campusId);
    if (!campus || campus.tenantId !== tenantId) {
      throw new NotFoundException(`Campus ${dto.campusId} not found in this school`);
    }

    const targetClass = this.prisma.memoryStore.classes.get(dto.classId);
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Class ${dto.classId} not found in this school`);
    }

    const academicYear = this.prisma.memoryStore.academicYears.get(dto.academicYearId);
    if (!academicYear || academicYear.tenantId !== tenantId) {
      throw new NotFoundException(`Academic year ${dto.academicYearId} not found in this school`);
    }

    const admissionNumber = dto.customAdmissionNumber || dto.admissionNumber || this.generateAdmissionNumber(tenantId);
    const existingNumber = Array.from(this.prisma.memoryStore.students.values()).find(
      (s: any) => s.tenantId === tenantId && s.admissionNumber === admissionNumber,
    );
    if (existingNumber) {
      throw new ConflictException(`Admission number "${admissionNumber}" is already in use.`);
    }

    const studentId = `std_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const student = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.students.set(studentId, student);

    // Parent
    const parentPhone = dto.parentPhone ? dto.parentPhone.trim() : null;
    let parent = parentPhone
      ? Array.from(this.prisma.memoryStore.parents.values()).find(
          (p: any) => p.tenantId === tenantId && p.phone === parentPhone,
        )
      : null;

    if (!parent) {
      const parentId = `prt_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
      parent = {
        id: parentId,
        tenantId,
        firstName: dto.parentFirstName ? dto.parentFirstName.trim() : '',
        lastName: dto.parentLastName ? dto.parentLastName.trim() : '',
        email: dto.parentEmail ? dto.parentEmail.trim().toLowerCase() : null,
        phone: parentPhone,
        relationship: dto.parentRelationship || 'Parent',
        occupation: null,
        address: dto.parentAddress || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.parents.set(parentId, parent);
    }

    const studentParent = {
      id: `sp_${randomUUID().replace(/-/g, '').substring(0, 10)}`,
      studentId,
      parentId: parent.id,
      relationship: dto.parentRelationship || 'Parent',
      isPrimaryContact: true,
      isEmergencyContact: true,
      canPickup: true,
      isFinancialGuarantor: true,
    };
    this.prisma.memoryStore.studentParents.set(`${studentId}_${parent.id}`, studentParent);

    const enrollmentId = `enr_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const enrollment = {
      id: enrollmentId,
      tenantId,
      studentId,
      classId: dto.classId,
      academicYearId: dto.academicYearId,
      rollNumber: dto.rollNumber || null,
      status: 'ACTIVE',
      enrolledAt: new Date(),
    };
    this.prisma.memoryStore.enrollments.set(enrollmentId, enrollment);

    const lifecycleEventId = `ev_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const lifecycleEvent = {
      id: lifecycleEventId,
      tenantId,
      studentId,
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
      createdAt: new Date(),
    };
    this.prisma.memoryStore.studentLifecycleEvents.set(lifecycleEventId, lifecycleEvent);

    this.logger.log(`Direct enrolled student ${admissionNumber} (${studentId}) by ${actorUserId}`);
    return {
      student,
      enrollment,
      parent,
      studentParent,
      lifecycleEvent,
    };
  }
}
