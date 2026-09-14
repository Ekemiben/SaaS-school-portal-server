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
  private readonly fallbackCertificates: FitnessCertificateRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalProfileService: MedicalProfileService,
  ) {}

  async issueCertificate(
    tenantId: string,
    dto: CreateFitnessCertificateDto,
  ): Promise<FitnessCertificateRecord> {
    let studentName = 'Student';
    try {
      const profile = await this.medicalProfileService.getMedicalProfile(
        tenantId,
        dto.studentId,
      );
      if (profile?.student?.fullName) {
        studentName = profile.student.fullName;
      }
    } catch {
      // student may exist in prisma directly
    }

    const cleanTenant = tenantId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
    const cleanUuid = randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
    const verificationCode = `MCERT-${cleanTenant || 'SCH'}-${cleanUuid}`;

    const record: FitnessCertificateRecord = {
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
      examinationDate: dto.examinationDate,
      validUntil: dto.validUntil,
      activityRestrictions: dto.activityRestrictions || [],
      accommodations: dto.accommodations || [],
      clinicalNotes: dto.clinicalNotes,
      documentFileId: dto.documentFileId,
      isRevoked: false,
      createdAt: new Date().toISOString(),
    };

    this.fallbackCertificates.push(record);
    this.logger.log(`Issued medical fitness certificate ${record.id} for student ${dto.studentId}`);
    return record;
  }

  async getCertificates(
    tenantId: string,
    filter?: FitnessCertificateFilterDto,
  ): Promise<FitnessCertificateRecord[]> {
    let results = this.fallbackCertificates.filter((c) => c.tenantId === tenantId);

    if (filter?.studentId) {
      results = results.filter((c) => c.studentId === filter.studentId);
    }
    if (filter?.certificateType) {
      results = results.filter((c) => c.certificateType === filter.certificateType);
    }
    if (filter?.fitnessStatus) {
      results = results.filter((c) => c.fitnessStatus === filter.fitnessStatus);
    }

    return results;
  }

  async getCertificateById(
    tenantId: string,
    certificateId: string,
  ): Promise<FitnessCertificateRecord> {
    const cert = this.fallbackCertificates.find(
      (c) => c.tenantId === tenantId && c.id === certificateId,
    );
    if (!cert) {
      throw new NotFoundException(`Medical certificate with ID ${certificateId} not found`);
    }
    return cert;
  }

  async verifyCertificatePublic(
    tenantId: string,
    verificationCode: string,
  ) {
    const cert = this.fallbackCertificates.find(
      (c) => c.tenantId === tenantId && c.verificationCode === verificationCode,
    );

    if (!cert) {
      return {
        isValid: false,
        verificationCode,
        message: 'Certificate not found or invalid verification token',
      };
    }

    const isExpired = new Date(cert.validUntil).getTime() < Date.now();
    const isValid = !cert.isRevoked && !isExpired;

    return {
      isValid,
      verificationCode: cert.verificationCode,
      certificateType: cert.certificateType,
      fitnessStatus: cert.fitnessStatus,
      activityRestrictions: cert.activityRestrictions,
      accommodations: cert.accommodations,
      examiningPhysician: cert.examiningPhysician,
      clinicOrHospitalName: cert.clinicOrHospitalName,
      examinationDate: cert.examinationDate,
      validUntil: cert.validUntil,
      isExpired,
      isRevoked: cert.isRevoked,
      issuedAt: cert.createdAt,
    };
  }

  async getLatestActiveCertificate(
    tenantId: string,
    studentId: string,
    certificateType?: CertificateType,
  ): Promise<FitnessCertificateRecord | null> {
    const certs = await this.getCertificates(tenantId, {
      studentId,
      certificateType,
    });

    const activeCerts = certs
      .filter((c) => !c.isRevoked && new Date(c.validUntil).getTime() >= Date.now())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return activeCerts.length > 0 ? activeCerts[0] : null;
  }
}
