import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
    const rawRecipients: RecipientInfo[] = [];

    switch (dto.audienceType) {
      case AudienceType.ALL_PARENTS: {
        const parents = await this.prisma.parent.findMany({
          where: { tenantId },
        });
        for (const p of parents) {
          rawRecipients.push({
            userId: p.userId || p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Parent',
            email: p.email || undefined,
            phone: p.phone || undefined,
            role: 'PARENT',
          });
        }
        break;
      }

      case AudienceType.CLASS_PARENTS: {
        const classIds = dto.classIds || (dto.classId ? [dto.classId] : []);
        const students = await this.prisma.student.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            ...(classIds.length > 0
              ? { enrollments: { some: { classId: { in: classIds }, status: 'ACTIVE' } } }
              : {}),
          },
          include: {
            parents: {
              include: { parent: true },
            },
          },
        });

        for (const s of students) {
          for (const sp of s.parents) {
            const p = sp.parent;
            if (p) {
              rawRecipients.push({
                userId: p.userId || p.id,
                name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Parent',
                email: p.email || undefined,
                phone: p.phone || undefined,
                role: 'PARENT',
                studentId: s.id,
                studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
              });
            }
          }
        }
        break;
      }

      case AudienceType.ALL_STUDENTS: {
        const students = await this.prisma.student.findMany({
          where: { tenantId, status: 'ACTIVE' },
        });
        for (const s of students) {
          rawRecipients.push({
            userId: (s as any).userId || s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            email: s.email || undefined,
            phone: s.phone || undefined,
            role: 'STUDENT',
            studentId: s.id,
            studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          });
        }
        break;
      }

      case AudienceType.ALL_TEACHERS: {
        const teachers = await this.prisma.teacher.findMany({
          where: { tenantId },
        });
        for (const t of teachers) {
          rawRecipients.push({
            userId: t.userId || t.id,
            name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Teacher',
            email: t.email || undefined,
            phone: t.phone || undefined,
            role: 'TEACHER',
          });
        }

        if (rawRecipients.length === 0) {
          const teacherUsers = await this.prisma.user.findMany({
            where: {
              tenantId,
              isActive: true,
              userRoles: { some: { role: { name: 'TEACHER' } } },
            },
          });
          for (const u of teacherUsers) {
            rawRecipients.push({
              userId: u.id,
              name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Teacher',
              email: u.email || undefined,
              phone: u.phone || undefined,
              role: 'TEACHER',
            });
          }
        }
        break;
      }

      case AudienceType.ALL_STAFF: {
        const staffMembers = await this.prisma.staff.findMany({
          where: { tenantId },
        });
        for (const s of staffMembers) {
          rawRecipients.push({
            userId: s.userId || s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Staff Member',
            email: s.email || undefined,
            phone: s.phone || undefined,
            role: 'STAFF',
          });
        }

        const staffUsers = await this.prisma.user.findMany({
          where: {
            tenantId,
            isActive: true,
            userRoles: {
              some: {
                role: {
                  name: { in: ['STAFF', 'TEACHER', 'ADMIN', 'BURSAR', 'PRINCIPAL', 'ACCOUNTANT'] },
                },
              },
            },
          },
        });
        for (const u of staffUsers) {
          rawRecipients.push({
            userId: u.id,
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Staff Member',
            email: u.email || undefined,
            phone: u.phone || undefined,
            role: 'STAFF',
          });
        }
        break;
      }

      case AudienceType.SELECTED_CAMPUS: {
        if (!dto.campusId) break;
        const students = await this.prisma.student.findMany({
          where: { tenantId, campusId: dto.campusId, status: 'ACTIVE' },
        });
        for (const s of students) {
          rawRecipients.push({
            userId: (s as any).userId || s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            email: s.email || undefined,
            phone: s.phone || undefined,
            role: 'STUDENT',
            studentId: s.id,
          });
        }
        break;
      }

      case AudienceType.SELECTED_CLASS:
      case AudienceType.SELECTED_CLASSES: {
        const classIds = dto.classIds || (dto.classId ? [dto.classId] : []);
        const students = await this.prisma.student.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            enrollments: {
              some: {
                classId: { in: classIds },
                status: 'ACTIVE',
              },
            },
          },
        });
        for (const s of students) {
          rawRecipients.push({
            userId: (s as any).userId || s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            email: s.email || undefined,
            phone: s.phone || undefined,
            role: 'STUDENT',
            studentId: s.id,
          });
        }
        break;
      }

      case AudienceType.FEE_DEBTORS:
      case AudienceType.PARENTS_OUTSTANDING_FEES:
      case AudienceType.STUDENTS_OUTSTANDING_FEES: {
        const invoices = await this.prisma.invoice.findMany({
          where: {
            tenantId,
            balanceAmount: { gt: 0 },
            status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
          },
          include: {
            student: {
              include: {
                parents: {
                  include: { parent: true },
                },
              },
            },
          },
        });

        for (const inv of invoices) {
          const student = inv.student;
          if (!student) continue;

          if (dto.audienceType === AudienceType.STUDENTS_OUTSTANDING_FEES) {
            rawRecipients.push({
              userId: (student as any).userId || student.id,
              name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
              email: student.email || undefined,
              phone: student.phone || undefined,
              role: 'STUDENT',
              studentId: student.id,
              balanceAmount: Number(inv.balanceAmount),
            });
          } else {
            for (const sp of student.parents) {
              const p = sp.parent;
              if (p) {
                rawRecipients.push({
                  userId: p.userId || p.id,
                  name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Parent of ${student.firstName}`,
                  email: p.email || undefined,
                  phone: p.phone || undefined,
                  role: 'PARENT',
                  studentId: student.id,
                  studentName: `${student.firstName} ${student.lastName}`,
                  balanceAmount: Number(inv.balanceAmount),
                });
              }
            }
          }
        }
        break;
      }

      case AudienceType.STUDENTS_ABSENT_TODAY: {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const attendanceRecords = await this.prisma.attendance.findMany({
          where: {
            tenantId,
            date: { gte: startOfDay, lte: endOfDay },
            status: 'ABSENT',
          },
          include: {
            student: true,
          },
        });

        for (const att of attendanceRecords) {
          if (att.student) {
            rawRecipients.push({
              userId: (att.student as any).userId || att.student.id,
              name: `${att.student.firstName || ''} ${att.student.lastName || ''}`.trim(),
              email: att.student.email || undefined,
              phone: att.student.phone || undefined,
              role: 'STUDENT',
              studentId: att.student.id,
              studentName: `${att.student.firstName} ${att.student.lastName}`,
            });
          }
        }
        break;
      }

      case AudienceType.PARENTS_ABSENT_TODAY: {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const attendanceRecords = await this.prisma.attendance.findMany({
          where: {
            tenantId,
            date: { gte: startOfDay, lte: endOfDay },
            status: 'ABSENT',
          },
          include: {
            student: {
              include: {
                parents: {
                  include: { parent: true },
                },
              },
            },
          },
        });

        for (const att of attendanceRecords) {
          const student = att.student;
          if (!student) continue;

          for (const sp of student.parents) {
            const p = sp.parent;
            if (p) {
              rawRecipients.push({
                userId: p.userId || p.id,
                name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Parent of ${student.firstName}`,
                email: p.email || undefined,
                phone: p.phone || undefined,
                role: 'PARENT',
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`,
              });
            }
          }
        }
        break;
      }

      case AudienceType.RESULTS_PUBLISHED_COHORT: {
        const results = await this.prisma.result.findMany({
          where: {
            tenantId,
            isPublished: true,
            ...(dto.examinationId ? { examinationId: dto.examinationId } : {}),
            ...(dto.classId ? { classId: dto.classId } : {}),
          },
          include: {
            student: {
              include: {
                parents: {
                  include: { parent: true },
                },
              },
            },
          },
        });

        for (const res of results) {
          const student = res.student;
          if (!student) continue;

          for (const sp of student.parents) {
            const p = sp.parent;
            if (p) {
              rawRecipients.push({
                userId: p.userId || p.id,
                name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Parent of ${student.firstName}`,
                email: p.email || undefined,
                phone: p.phone || undefined,
                role: 'PARENT',
                studentId: student.id,
                studentName: `${student.firstName} ${student.lastName}`,
              });
            }
          }
        }
        break;
      }

      case AudienceType.TRANSPORT_ROUTE_PARENTS: {
        const allocations = await this.prisma.studentTransportAllocation.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            ...(dto.routeId ? { routeId: dto.routeId } : {}),
          },
          include: {
            student: {
              include: {
                parents: {
                  include: { parent: true },
                },
              },
            },
          },
        });

        for (const alloc of allocations) {
          const student = alloc.student;
          if (!student) continue;

          for (const sp of student.parents) {
            const p = sp.parent;
            if (p) {
              rawRecipients.push({
                userId: p.userId || p.id,
                name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Parent of ${student.firstName}`,
                email: p.email || undefined,
                phone: p.phone || undefined,
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
          const users = await this.prisma.user.findMany({
            where: { id: { in: dto.customUserIds }, tenantId, isActive: true },
          });
          for (const u of users) {
            rawRecipients.push({
              userId: u.id,
              name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User',
              email: u.email || undefined,
              phone: u.phone || undefined,
              role: 'ADMIN',
            });
          }
        }
        break;
      }

      default: {
        throw new BadRequestException(
          `Unsupported audience type: ${dto.audienceType}. Controlled error generated per Architecture Constitution v2.1.`,
        );
      }
    }

    const deduplicated = this.deduplicateRecipients(rawRecipients);
    this.logger.log(`Resolved audience ${dto.audienceType} -> ${deduplicated.length} recipients from DB for tenant ${tenantId}`);
    return deduplicated;
  }

  private deduplicateRecipients(recipients: RecipientInfo[]): RecipientInfo[] {
    const uniqueMap = new Map<string, RecipientInfo>();
    for (const r of recipients) {
      const key = r.userId || (r.email ? `email_${r.email}` : r.phone ? `phone_${r.phone}` : `name_${r.name}`);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    }
    return Array.from(uniqueMap.values());
  }
}
