import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { MedicalProfileService } from './medical-profile.service.js';
import {
  CreateFitnessCertificateDto,
  FitnessCertificateFilterDto,
  CertificateType,
  FitnessStatus,
} from '../dto/fitness-certificate.dto.js';
import { randomUUID } from 'crypto';

export interface FitnessCertificateRecord {
  id: string;
  tenantId: string;
  studentId: string;
  studentName?: string;
  verificationCode: string;
  certificateType: CertificateType;
  fitnessStatus: FitnessStatus;
  examiningPhysician: string;
  medicalLicenseNumber: string;
  clinicOrHospitalName: string;
  examinationDate: string;
  validUntil: string;
  activityRestrictions: string[];
  accommodations: string[];
  clinicalNotes?: string;
  documentFileId?: string;
  isRevoked: boolean;
  createdAt: string;
}

@Injectable()
export class FitnessCertificateService {
  private readonly logger = new Logger(FitnessCertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalProfileService: MedicalProfileService,
  ) {}

  private mapToRecord(c: any): FitnessCertificateRecord {
    return {
      id: c.id,
      tenantId: c.tenantId,
      studentId: c.studentId,
      studentName: c.studentName || undefined,
      verificationCode: c.verificationCode,
      certificateType: c.certificateType as CertificateType,
      fitnessStatus: c.fitnessStatus as FitnessStatus,
      examiningPhysician: c.examiningPhysician,
      medicalLicenseNumber: c.medicalLicenseNumber,
      clinicOrHospitalName: c.clinicOrHospitalName,
      examinationDate: c.examinationDate instanceof Date ? c.examinationDate.toISOString() : c.examinationDate,
      validUntil: c.validUntil instanceof Date ? c.validUntil.toISOString() : c.validUntil,
      activityRestrictions: (c.activityRestrictions as string[]) || [],
      accommodations: (c.accommodations as string[]) || [],
      clinicalNotes: c.clinicalNotes || undefined,
      documentFileId: c.documentFileId || undefined,
      isRevoked: !!c.isRevoked,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    };
  }

  async issueCertificate(
    tenantId: string,
    dto: CreateFitnessCertificateDto,
  ): Promise<FitnessCertificateRecord> {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });
    if (!student) {
      throw new NotFoundException('Student record not found');
    }
    const studentName = `${student.firstName} ${student.lastName}`;

    const cleanTenant = tenantId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
    const cleanUuid = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
    const verificationCode = `MCERT-${cleanTenant || 'SCH'}-${cleanUuid}`;

    const record = await this.prisma.fitnessCertificate.create({
      data: {
        id: `cert_${randomUUID().replace(/-/g, '').substring(0, 8)}`,
        tenantId,
        studentId: dto.studentId,
        studentName,
        verificationCode,
        certificateType: dto.certificateType,
        fitnessStatus: dto.fitnessStatus,
        examiningPhysician: dto.examiningPhysician,
        medicalLicenseNumber: dto.medicalLicenseNumber,
        clinicOrHospitalName: dto.clinicOrHospitalName,
        examinationDate: new Date(dto.examinationDate),
        validUntil: new Date(dto.validUntil),
        activityRestrictions: dto.activityRestrictions || [],
        accommodations: dto.accommodations || [],
        clinicalNotes: dto.clinicalNotes || null,
        documentFileId: dto.documentFileId || null,
        isRevoked: false,
      },
    });

    this.logger.log(`Issued medical fitness certificate ${record.id} for student ${dto.studentId}`);
    return this.mapToRecord(record);
  }

  async getCertificates(
    tenantId: string,
    filter?: FitnessCertificateFilterDto,
  ): Promise<FitnessCertificateRecord[]> {
    const where: any = { tenantId };

    if (filter?.studentId) {
      where.studentId = filter.studentId;
    }
    if (filter?.certificateType) {
      where.certificateType = filter.certificateType;
    }
    if (filter?.fitnessStatus) {
      where.fitnessStatus = filter.fitnessStatus;
    }

    const certs = await this.prisma.fitnessCertificate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return certs.map((c) => this.mapToRecord(c));
  }

  async getCertificateById(
    tenantId: string,
    certificateId: string,
  ): Promise<FitnessCertificateRecord> {
    const cert = await this.prisma.fitnessCertificate.findFirst({
      where: { id: certificateId, tenantId },
    });
    if (!cert) {
      throw new NotFoundException(`Medical certificate with ID ${certificateId} not found`);
    }
    return this.mapToRecord(cert);
  }

  async verifyCertificatePublic(
    tenantId: string,
    verificationCode: string,
  ) {
    const cert = await this.prisma.fitnessCertificate.findFirst({
      where: { tenantId, verificationCode },
    });

    if (!cert) {
      return {
        isValid: false,
        verificationCode,
        message: 'Certificate not found or invalid verification token',
      };
    }

    const record = this.mapToRecord(cert);
    const isExpired = new Date(record.validUntil).getTime() < Date.now();
    const isValid = !record.isRevoked && !isExpired;

    return {
      isValid,
      verificationCode: record.verificationCode,
      certificateType: record.certificateType,
      fitnessStatus: record.fitnessStatus,
      activityRestrictions: record.activityRestrictions,
      accommodations: record.accommodations,
      examiningPhysician: record.examiningPhysician,
      clinicOrHospitalName: record.clinicOrHospitalName,
      examinationDate: record.examinationDate,
      validUntil: record.validUntil,
      isExpired,
      isRevoked: record.isRevoked,
      issuedAt: record.createdAt,
    };
  }

  async getLatestActiveCertificate(
    tenantId: string,
    studentId: string,
    certificateType?: CertificateType,
  ): Promise<FitnessCertificateRecord | null> {
    const now = new Date();
    const where: any = {
      tenantId,
      studentId,
      isRevoked: false,
      validUntil: { gte: now },
    };
    if (certificateType) {
      where.certificateType = certificateType;
    }

    const cert = await this.prisma.fitnessCertificate.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return cert ? this.mapToRecord(cert) : null;
  }
}
