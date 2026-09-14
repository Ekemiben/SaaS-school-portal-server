import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  AudienceType,
  ResolveAudienceDto,
  RecipientInfo,
} from '../dto/audience.dto.js';

@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveAudience(
    tenantId: string,
    dto: ResolveAudienceDto,
  ): Promise<RecipientInfo[]> {
    const recipients: RecipientInfo[] = [];

    switch (dto.audienceType) {
      case AudienceType.ALL_PARENTS: {
        const parents = Array.from(this.prisma.memoryStore.parents.values()).filter(
          (p) => p.tenantId === tenantId,
        );
        for (const p of parents) {
          recipients.push({
            userId: p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Parent',
            email: p.email,
            phone: p.phone,
            role: 'PARENT',
          });
        }
        break;
      }

      case AudienceType.ALL_STUDENTS: {
        const students = Array.from(this.prisma.memoryStore.students.values()).filter(
          (s) => s.tenantId === tenantId && s.status === 'ACTIVE',
        );
        for (const s of students) {
          recipients.push({
            userId: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            role: 'STUDENT',
            studentId: s.id,
            studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          });
        }
        break;
      }

      case AudienceType.SELECTED_CAMPUS: {
        if (!dto.campusId) break;
        const students = Array.from(this.prisma.memoryStore.students.values()).filter(
          (s) => s.tenantId === tenantId && s.campusId === dto.campusId,
        );
        for (const s of students) {
          recipients.push({
            userId: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            role: 'STUDENT',
            studentId: s.id,
          });
        }
        break;
      }

      case AudienceType.SELECTED_CLASS:
      case AudienceType.SELECTED_CLASSES: {
        const classIds = dto.classIds || (dto.classId ? [dto.classId] : []);
        const students = Array.from(this.prisma.memoryStore.students.values()).filter(
          (s) => s.tenantId === tenantId && (classIds.includes(s.currentClassId) || classIds.includes(s.classId)),
        );
        for (const s of students) {
          recipients.push({
            userId: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            role: 'STUDENT',
            studentId: s.id,
          });
        }
        break;
      }

      case AudienceType.STUDENTS_OUTSTANDING_FEES:
      case AudienceType.PARENTS_OUTSTANDING_FEES: {
        const invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
          (inv: any) => inv.tenantId === tenantId && inv.balanceAmount > 0,
        );
        const studentIdsWithFees = Array.from(new Set(invoices.map((inv: any) => inv.studentId)));

        for (const sId of studentIdsWithFees) {
          const student = this.prisma.memoryStore.students.get(sId);
          if (student) {
            if (dto.audienceType === AudienceType.STUDENTS_OUTSTANDING_FEES) {
              recipients.push({
                userId: student.id,
                name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                role: 'STUDENT',
                studentId: student.id,
              });
            } else {
              // Find parent for this student
              const parent = Array.from(this.prisma.memoryStore.parents.values()).find(
                (p) => p.tenantId === tenantId,
              );
              recipients.push({
                userId: parent?.id || `prt_${student.id}`,
                name: parent ? `${parent.firstName} ${parent.lastName}` : `Parent of ${student.firstName}`,
                email: parent?.email,
                phone: parent?.phone,
                role: 'PARENT',
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`,
              });
            }
          }
        }
        break;
      }

      case AudienceType.CUSTOM_RECIPIENTS: {
        if (dto.customUserIds && dto.customUserIds.length > 0) {
          for (const uid of dto.customUserIds) {
            const student = this.prisma.memoryStore.students.get(uid);
            const parent = this.prisma.memoryStore.parents.get(uid);
            if (student) {
              recipients.push({
                userId: student.id,
                name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                role: 'STUDENT',
                studentId: student.id,
              });
            } else if (parent) {
              recipients.push({
                userId: parent.id,
                name: `${parent.firstName || ''} ${parent.lastName || ''}`.trim(),
                email: parent.email,
                phone: parent.phone,
                role: 'PARENT',
              });
            } else {
              recipients.push({
                userId: uid,
                name: 'Custom User',
                role: 'ADMIN',
              });
            }
          }
        }
        break;
      }

      default: {
        // Fallback to all parents
        const parents = Array.from(this.prisma.memoryStore.parents.values()).filter(
          (p) => p.tenantId === tenantId,
        );
        for (const p of parents) {
          recipients.push({
            userId: p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Parent',
            email: p.email,
            phone: p.phone,
            role: 'PARENT',
          });
        }
        break;
      }
    }

    // Deduplicate by userId
    const unique = new Map<string, RecipientInfo>();
    for (const r of recipients) {
      const key = r.userId || `${r.email}_${r.phone}`;
      if (!unique.has(key)) {
        unique.set(key, r);
      }
    }

    this.logger.log(`Resolved audience ${dto.audienceType} -> ${unique.size} recipients for tenant ${tenantId}`);
    return Array.from(unique.values());
  }
}
