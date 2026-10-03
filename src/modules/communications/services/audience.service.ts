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

    if (this.prisma.isDbConnected) {
      try {
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

            // Also check users with TEACHER role if teachers table has no direct user records
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

            // Include all administrative/staff users in the tenant
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

        if (rawRecipients.length > 0) {
          const deduplicated = this.deduplicateRecipients(rawRecipients);
          this.logger.log(
            `Resolved audience ${dto.audienceType} -> ${deduplicated.length} recipients from DB for tenant ${tenantId}`,
          );
          return deduplicated;
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Could not resolve audience from DB: ${err.message}`);
      }
    }

    // Memory Store Fallback
    switch (dto.audienceType) {
      case AudienceType.ALL_PARENTS: {
        const parents = Array.from(this.prisma.memoryStore.parents.values()).filter(
          (p) => p.tenantId === tenantId,
        );
        for (const p of parents) {
          rawRecipients.push({
            userId: p.userId || p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Parent',
            email: p.email,
            phone: p.phone,
            role: 'PARENT',
          });
        }
        break;
      }

      case AudienceType.CLASS_PARENTS: {
        const classIds = dto.classIds || (dto.classId ? [dto.classId] : []);
        const students = Array.from(this.prisma.memoryStore.students.values()).filter(
          (s) =>
            s.tenantId === tenantId &&
            s.status === 'ACTIVE' &&
            (classIds.length === 0 || classIds.includes(s.currentClassId) || classIds.includes(s.classId)),
        );
        for (const s of students) {
          const parent = Array.from(this.prisma.memoryStore.parents.values()).find(
            (p) => p.tenantId === tenantId,
          );
          if (parent) {
            rawRecipients.push({
              userId: parent.userId || parent.id,
              name: `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 'Parent',
              email: parent.email,
              phone: parent.phone,
              role: 'PARENT',
              studentId: s.id,
              studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            });
          }
        }
        break;
      }

      case AudienceType.ALL_STUDENTS: {
        const students = Array.from(this.prisma.memoryStore.students.values()).filter(
          (s) => s.tenantId === tenantId && s.status === 'ACTIVE',
        );
        for (const s of students) {
          rawRecipients.push({
            userId: s.userId || s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            role: 'STUDENT',
            studentId: s.id,
            studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          });
        }
        break;
      }

      case AudienceType.ALL_TEACHERS: {
        const teachers = Array.from(this.prisma.memoryStore.teachers.values()).filter(
          (t) => t.tenantId === tenantId,
        );
        for (const t of teachers) {
          rawRecipients.push({
            userId: t.userId || t.id,
            name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || 'Teacher',
            email: t.email,
            phone: t.phone,
            role: 'TEACHER',
          });
        }
        break;
      }

      case AudienceType.ALL_STAFF: {
        const staff = Array.from(this.prisma.memoryStore.users.values()).filter(
          (u) => u.tenantId === tenantId && u.isActive !== false,
        );
        for (const s of staff) {
          rawRecipients.push({
            userId: s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Staff Member',
            email: s.email,
            phone: s.phone,
            role: 'STAFF',
          });
        }
        break;
      }

      case AudienceType.SELECTED_CAMPUS: {
        if (!dto.campusId) break;
        const students = Array.from(this.prisma.memoryStore.students.values()).filter(
          (s) => s.tenantId === tenantId && s.campusId === dto.campusId && s.status === 'ACTIVE',
        );
        for (const s of students) {
          rawRecipients.push({
            userId: s.userId || s.id,
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
          (s) =>
            s.tenantId === tenantId &&
            s.status === 'ACTIVE' &&
            (classIds.includes(s.currentClassId) || classIds.includes(s.classId)),
        );
        for (const s of students) {
          rawRecipients.push({
            userId: s.userId || s.id,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            role: 'STUDENT',
            studentId: s.id,
          });
        }
        break;
      }

      case AudienceType.FEE_DEBTORS:
      case AudienceType.STUDENTS_OUTSTANDING_FEES:
      case AudienceType.PARENTS_OUTSTANDING_FEES: {
        const invoices = Array.from(this.prisma.memoryStore.invoices.values()).filter(
          (inv: any) =>
            inv.tenantId === tenantId &&
            inv.balanceAmount > 0 &&
            inv.status !== 'CANCELLED',
        );
        const studentIdsWithFees = Array.from(new Set(invoices.map((inv: any) => inv.studentId)));

        for (const sId of studentIdsWithFees) {
          const student = this.prisma.memoryStore.students.get(sId);
          if (student) {
            if (dto.audienceType === AudienceType.STUDENTS_OUTSTANDING_FEES) {
              rawRecipients.push({
                userId: student.userId || student.id,
                name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                role: 'STUDENT',
                studentId: student.id,
              });
            } else {
              const parent = Array.from(this.prisma.memoryStore.parents.values()).find(
                (p) => p.tenantId === tenantId,
              );
              rawRecipients.push({
                userId: parent?.userId || parent?.id || `prt_${student.id}`,
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

      case AudienceType.STUDENTS_ABSENT_TODAY: {
        const attendance = Array.from(this.prisma.memoryStore.attendance.values()).filter(
          (a) => a.tenantId === tenantId && a.status === 'ABSENT',
        );
        for (const att of attendance) {
          const student = this.prisma.memoryStore.students.get(att.studentId);
          if (student) {
            rawRecipients.push({
              userId: student.userId || student.id,
              name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
              role: 'STUDENT',
              studentId: student.id,
            });
          }
        }
        break;
      }

      case AudienceType.PARENTS_ABSENT_TODAY: {
        const attendance = Array.from(this.prisma.memoryStore.attendance.values()).filter(
          (a) => a.tenantId === tenantId && a.status === 'ABSENT',
        );
        for (const att of attendance) {
          const student = this.prisma.memoryStore.students.get(att.studentId);
          const parent = Array.from(this.prisma.memoryStore.parents.values()).find(
            (p) => p.tenantId === tenantId,
          );
          if (student && parent) {
            rawRecipients.push({
              userId: parent.userId || parent.id,
              name: `${parent.firstName || ''} ${parent.lastName || ''}`.trim(),
              email: parent.email,
              phone: parent.phone,
              role: 'PARENT',
              studentId: student.id,
              studentName: `${student.firstName} ${student.lastName}`,
            });
          }
        }
        break;
      }

      case AudienceType.RESULTS_PUBLISHED_COHORT: {
        const results = Array.from(this.prisma.memoryStore.results.values()).filter(
          (r: any) => r.tenantId === tenantId && r.isPublished === true,
        );
        for (const res of results) {
          const student = this.prisma.memoryStore.students.get(res.studentId);
          const parent = Array.from(this.prisma.memoryStore.parents.values()).find(
            (p) => p.tenantId === tenantId,
          );
          if (student && parent) {
            rawRecipients.push({
              userId: parent.userId || parent.id,
              name: `${parent.firstName || ''} ${parent.lastName || ''}`.trim(),
              email: parent.email,
              phone: parent.phone,
              role: 'PARENT',
              studentId: student.id,
              studentName: `${student.firstName} ${student.lastName}`,
            });
          }
        }
        break;
      }

      case AudienceType.TRANSPORT_ROUTE_PARENTS: {
        const allocations = Array.from(
          this.prisma.memoryStore.studentTransportAllocations.values(),
        ).filter(
          (a: any) =>
            a.tenantId === tenantId &&
            a.status === 'ACTIVE' &&
            (!dto.routeId || a.routeId === dto.routeId),
        );
        for (const alloc of allocations) {
          const student = this.prisma.memoryStore.students.get(alloc.studentId);
          const parent = Array.from(this.prisma.memoryStore.parents.values()).find(
            (p) => p.tenantId === tenantId,
          );
          if (student && parent) {
            rawRecipients.push({
              userId: parent.userId || parent.id,
              name: `${parent.firstName || ''} ${parent.lastName || ''}`.trim(),
              email: parent.email,
              phone: parent.phone,
              role: 'PARENT',
              studentId: student.id,
              studentName: `${student.firstName} ${student.lastName}`,
            });
          }
        }
        break;
      }

      case AudienceType.CUSTOM_RECIPIENTS: {
        if (dto.customUserIds && dto.customUserIds.length > 0) {
          for (const uid of dto.customUserIds) {
            const student = this.prisma.memoryStore.students.get(uid);
            const parent = this.prisma.memoryStore.parents.get(uid);
            const user = this.prisma.memoryStore.users.get(uid);
            if (student && student.tenantId === tenantId) {
              rawRecipients.push({
                userId: student.userId || student.id,
                name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                role: 'STUDENT',
                studentId: student.id,
              });
            } else if (parent && parent.tenantId === tenantId) {
              rawRecipients.push({
                userId: parent.userId || parent.id,
                name: `${parent.firstName || ''} ${parent.lastName || ''}`.trim(),
                email: parent.email,
                phone: parent.phone,
                role: 'PARENT',
              });
            } else if (user && user.tenantId === tenantId) {
              rawRecipients.push({
                userId: user.id,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
                email: user.email,
                phone: user.phone,
                role: 'ADMIN',
              });
            } else {
              rawRecipients.push({
                userId: uid,
                name: 'Custom Recipient',
                role: 'PARENT',
                phone: '+2348000000000',
              });
            }
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
    this.logger.log(`Resolved audience ${dto.audienceType} -> ${deduplicated.length} recipients for tenant ${tenantId}`);
    return deduplicated;
  }

  private deduplicateRecipients(recipients: RecipientInfo[]): RecipientInfo[] {
    const uniqueMap = new Map<string, RecipientInfo>();
    for (const r of recipients) {
      // Prioritize unique userId, fallback to composite email/phone key
      const key = r.userId || (r.email ? `email_${r.email}` : r.phone ? `phone_${r.phone}` : `name_${r.name}`);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    }
    return Array.from(uniqueMap.values());
  }
}
