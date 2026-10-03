import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ExaminationsService {
  private readonly logger = new Logger(ExaminationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // MASTER EXAMINATION HALLS
  // ==========================================

  async listExamHalls(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        return await this.prisma.examinationHall.findMany({
          where: {
            tenantId,
            ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}),
          },
          include: {
            campus: { select: { id: true, name: true, code: true } },
            _count: { select: { schedules: true } },
          },
          orderBy: { name: 'asc' },
        });
      } catch (err: any) {
        this.logger.warn(`Failed querying examination halls from DB: ${err.message}`);
      }
    }

    const items = Array.from((this.prisma.memoryStore as any).examinationHalls?.values() || [])
      .filter((h: any) => h.tenantId === tenantId && (!campusId || !h.campusId || h.campusId === campusId));
    return items;
  }

  async getExamHallById(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const hall = await this.prisma.examinationHall.findFirst({
        where: { id, tenantId },
        include: {
          campus: { select: { id: true, name: true, code: true } },
        },
      });
      if (!hall) throw new NotFoundException(`Examination hall "${id}" not found.`);
      return hall;
    }

    const hall = (this.prisma.memoryStore as any).examinationHalls?.get(id);
    if (!hall || hall.tenantId !== tenantId) throw new NotFoundException('Examination hall not found.');
    return hall;
  }

  async createExamHall(
    tenantId: string,
    data: { name: string; campusId?: string; building?: string; roomNumber?: string; capacity?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Hall name is required.');

    if (this.prisma.isDbConnected) {
      if (data.campusId) {
        const campus = await this.prisma.campus.findFirst({
          where: { id: data.campusId, tenantId },
        });
        if (!campus) throw new ForbiddenException('Referenced campus does not belong to this school organization.');
      }

      const existing = await this.prisma.examinationHall.findFirst({
        where: { tenantId, name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        throw new ConflictException(`An examination hall with name "${name}" already exists.`);
      }

      const id = `hall_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      return await this.prisma.examinationHall.create({
        data: {
          id,
          tenantId,
          campusId: data.campusId || null,
          name,
          building: data.building?.trim() || null,
          roomNumber: data.roomNumber?.trim() || null,
          capacity: data.capacity ? Number(data.capacity) : 100,
        },
        include: {
          campus: { select: { id: true, name: true, code: true } },
        },
      });
    }

    const id = `hall_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const hall = {
      id,
      tenantId,
      campusId: data.campusId || null,
      name,
      building: data.building || null,
      roomNumber: data.roomNumber || null,
      capacity: data.capacity || 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!(this.prisma.memoryStore as any).examinationHalls) {
      (this.prisma.memoryStore as any).examinationHalls = new Map();
    }
    (this.prisma.memoryStore as any).examinationHalls.set(id, hall);
    return hall;
  }

  async updateExamHall(
    tenantId: string,
    id: string,
    data: { name?: string; campusId?: string | null; building?: string; roomNumber?: string; capacity?: number },
  ) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.examinationHall.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Examination hall "${id}" not found.`);

      if (data.name) {
        const duplicate = await this.prisma.examinationHall.findFirst({
          where: {
            tenantId,
            id: { not: id },
            name: { equals: data.name.trim(), mode: 'insensitive' },
          },
        });
        if (duplicate) throw new ConflictException(`Another examination hall with name "${data.name.trim()}" already exists.`);
      }

      if (data.campusId) {
        const campus = await this.prisma.campus.findFirst({ where: { id: data.campusId, tenantId } });
        if (!campus) throw new ForbiddenException('Referenced campus does not belong to this school organization.');
      }

      return await this.prisma.examinationHall.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name.trim() }),
          ...(data.campusId !== undefined && { campusId: data.campusId }),
          ...(data.building !== undefined && { building: data.building?.trim() || null }),
          ...(data.roomNumber !== undefined && { roomNumber: data.roomNumber?.trim() || null }),
          ...(data.capacity !== undefined && { capacity: Number(data.capacity) }),
        },
        include: {
          campus: { select: { id: true, name: true, code: true } },
        },
      });
    }

    const hall = (this.prisma.memoryStore as any).examinationHalls?.get(id);
    if (!hall || hall.tenantId !== tenantId) throw new NotFoundException('Examination hall not found.');
    Object.assign(hall, data, { updatedAt: new Date() });
    return hall;
  }

  async deleteExamHall(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.examinationHall.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException(`Examination hall "${id}" not found.`);

      await this.prisma.examSchedule.updateMany({
        where: { hallId: id },
        data: { hallId: null },
      });

      await this.prisma.examinationHall.delete({ where: { id } });
      return { success: true, message: `Examination hall "${existing.name}" removed successfully.` };
    }

    (this.prisma.memoryStore as any).examinationHalls?.delete(id);
    return { success: true, message: 'Examination hall removed successfully.' };
  }

  // ==========================================
  // EXAM CYCLES & SITTINGS
  // ==========================================

  private formatSchedule(s: any) {
    const invigilatorName = s.chiefInvigilator
      ? `${s.chiefInvigilator.firstName} ${s.chiefInvigilator.lastName}`.trim()
      : 'Chief Invigilator';

    const assistantName = s.assistantInvigilator
      ? `${s.assistantInvigilator.firstName} ${s.assistantInvigilator.lastName}`.trim()
      : '';

    const hallName = s.hall?.name || s.hallName || 'Main Examination Hall';

    return {
      id: s.id,
      examCycleId: s.examinationId,
      subjectId: s.subjectId,
      subject: s.subject?.name || 'Subject',
      paperCode: s.paperCode || s.subject?.code || 'PAPER',
      classId: s.classId,
      classLevel: s.class?.name || 'Class',
      date: s.examDate ? (typeof s.examDate === 'string' ? s.examDate.slice(0, 10) : s.examDate.toISOString().split('T')[0]) : '',
      startTime: s.startTime || '09:00 AM',
      endTime: s.endTime || '11:30 AM',
      duration: s.duration || '2h 30m',
      hallId: s.hallId || null,
      hall: hallName,
      chiefInvigilatorId: s.chiefInvigilatorId || null,
      invigilator: invigilatorName,
      assistantInvigilatorId: s.assistantInvigilatorId || null,
      assistantInvigilator: assistantName,
      candidatesCount: s.candidatesCount !== undefined ? s.candidatesCount : 0,
      maxMarks: s.maxMarks || 100,
      maxScore: s.maxMarks || 100,
      passMarks: s.passMarks || 40,
      weightPercentage: s.weightPercentage || 60,
      instructions: s.instructions || '',
    };
  }

  async findAll(tenantId: string, campusId?: string) {
    if (this.prisma.isDbConnected) {
      try {
        const exams = await this.prisma.examination.findMany({
          where: {
            tenantId,
            ...(campusId ? { campusId } : {}),
          },
          include: {
            academicYear: true,
            term: true,
            campus: true,
            schedules: {
              include: {
                subject: true,
                class: true,
                hall: true,
                chiefInvigilator: true,
                assistantInvigilator: true,
              },
              orderBy: { examDate: 'asc' },
            },
          },
          orderBy: { startDate: 'desc' },
        });

        if (exams.length > 0) {
          const studentCount = await this.prisma.student.count({
            where: { tenantId, status: 'ACTIVE', ...(campusId ? { campusId } : {}) },
          });

          return exams.map((e) => {
            const papers = e.schedules.map((s) => this.formatSchedule(s));
            const distinctHalls = new Set(papers.map((p) => p.hallId || p.hall).filter(Boolean));

            return {
              id: e.id,
              tenantId: e.tenantId,
              campusId: e.campusId,
              campus: e.campus?.name || 'Main Campus',
              academicYearId: e.academicYearId,
              termId: e.termId,
              title: e.name,
              name: e.name,
              examType: e.examType || 'Terminal Examination',
              session: e.academicYear?.name || '2026/2027',
              term: e.term?.name || 'First Term',
              startDate: e.startDate,
              endDate: e.endDate,
              status: e.status || (e.isPublished ? 'Published / Completed' : 'Scheduled'),
              isPublished: e.isPublished,
              registeredCandidates: studentCount || 0,
              hallCount: distinctHalls.size || 1,
              papersCount: papers.length,
              moderationProgress: e.isPublished ? 100 : 0,
              instructions: e.instructions || '',
              regulations: e.regulations || '',
              papers,
              createdAt: e.createdAt,
            };
          });
        }
      } catch (err: any) {
        this.logger.warn(`Failed querying examinations from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.examinations.values())
      .filter((e: any) => e.tenantId === tenantId && (!campusId || e.campusId === campusId))
      .map((e: any) => ({
        ...e,
        title: e.title || e.name,
        name: e.name || e.title,
        session: e.session || '2026/2027',
        term: e.term || 'First Term',
        papersCount: e.papers ? e.papers.length : e.papersCount || 0,
        hallCount: e.hallCount || 3,
        status: e.status || (e.isPublished ? 'Published / Completed' : 'Scheduled'),
        registeredCandidates: e.registeredCandidates || 540,
        moderationProgress: e.moderationProgress || 0,
        instructions: e.instructions || '',
        regulations: e.regulations || '',
        papers: e.papers || [],
      }));
  }

  async findById(tenantId: string, examId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const exam = await this.prisma.examination.findFirst({
          where: { id: examId, tenantId },
          include: {
            academicYear: true,
            term: true,
            campus: true,
            schedules: {
              include: {
                subject: true,
                class: true,
                hall: true,
                chiefInvigilator: true,
                assistantInvigilator: true,
              },
              orderBy: { examDate: 'asc' },
            },
          },
        });

        if (exam) {
          const studentCount = await this.prisma.student.count({
            where: { tenantId, status: 'ACTIVE', campusId: exam.campusId },
          });
          const papers = exam.schedules.map((s) => this.formatSchedule(s));
          const distinctHalls = new Set(papers.map((p) => p.hallId || p.hall).filter(Boolean));

          return {
            id: exam.id,
            tenantId: exam.tenantId,
            campusId: exam.campusId,
            campus: exam.campus?.name || 'Main Campus',
            academicYearId: exam.academicYearId,
            termId: exam.termId,
            title: exam.name,
            name: exam.name,
            examType: exam.examType || 'Terminal Examination',
            session: exam.academicYear?.name || '2026/2027',
            term: exam.term?.name || 'First Term',
            startDate: exam.startDate,
            endDate: exam.endDate,
            status: exam.status || (exam.isPublished ? 'Published / Completed' : 'Scheduled'),
            isPublished: exam.isPublished,
            registeredCandidates: studentCount || 0,
            hallCount: distinctHalls.size || 1,
            papersCount: papers.length,
            moderationProgress: exam.isPublished ? 100 : 0,
            instructions: exam.instructions || '',
            regulations: exam.regulations || '',
            papers,
            createdAt: exam.createdAt,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed querying examination by ID from DB: ${err.message}`);
      }
    }

    const exam = this.prisma.memoryStore.examinations.get(examId);
    if (!exam || exam.tenantId !== tenantId) {
      throw new NotFoundException('Examination not found in this school');
    }
    return exam;
  }

  async create(tenantId: string, data: any) {
    const id = `exam_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const title = data.title || data.name || 'Terminal Examination Series';
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const endDate = data.endDate ? new Date(data.endDate) : new Date(Date.now() + 14 * 86400000);

    let campusId = data.campusId;
    let academicYearId = data.academicYearId;
    let termId = data.termId;

    if (this.prisma.isDbConnected) {
      try {
        if (!campusId) {
          const c = await this.prisma.campus.findFirst({ where: { tenantId } });
          campusId = c?.id;
        }
        if (!academicYearId) {
          if (data.session) {
            const ay = await this.prisma.academicYear.findFirst({
              where: { tenantId, name: data.session },
            });
            academicYearId = ay?.id;
          }
          if (!academicYearId) {
            const ay = await this.prisma.academicYear.findFirst({
              where: { tenantId, isCurrent: true },
            }) || await this.prisma.academicYear.findFirst({ where: { tenantId } });
            academicYearId = ay?.id;
          }
        }
        if (!termId) {
          if (data.term && academicYearId) {
            const t = await this.prisma.term.findFirst({
              where: { tenantId, academicYearId, name: data.term },
            });
            termId = t?.id;
          }
          if (!termId && academicYearId) {
            const t = await this.prisma.term.findFirst({ where: { tenantId, academicYearId } });
            termId = t?.id;
          }
        }

        if (campusId && academicYearId && termId) {
          await this.prisma.examination.create({
            data: {
              id,
              tenantId,
              campusId,
              academicYearId,
              termId,
              name: title,
              examType: data.examType || 'TERM_EXAM',
              status: data.status || 'Scheduled',
              instructions: data.instructions?.trim() || null,
              regulations: data.regulations?.trim() || null,
              startDate,
              endDate,
              isPublished: data.status === 'Published / Completed' || !!data.isPublished,
            },
          });
          this.logger.log(`Created examination ${id} in PostgreSQL with instructions`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not persist examination to DB: ${err.message}`);
      }
    }

    const exam = {
      id,
      tenantId,
      campusId: campusId || 'campus_main_01',
      academicYearId: academicYearId || 'ay_2026_2027',
      termId: termId || 'term_first_2026',
      title,
      name: title,
      examType: data.examType || 'Terminal Examination',
      session: data.session || '2026/2027',
      term: data.term || 'First Term',
      startDate,
      endDate,
      status: data.status || 'Scheduled',
      registeredCandidates: data.registeredCandidates || 0,
      hallCount: data.hallCount || 1,
      papersCount: data.papers ? data.papers.length : data.papersCount || 0,
      moderationProgress: data.moderationProgress || 0,
      instructions: data.instructions || '',
      regulations: data.regulations || '',
      papers: data.papers || [],
      isPublished: data.status === 'Published / Completed' || !!data.isPublished,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.examinations.set(id, exam);
    return exam;
  }

  async update(tenantId: string, examId: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.examination.updateMany({
          where: { id: examId, tenantId },
          data: {
            ...(data.title || data.name ? { name: data.title || data.name } : {}),
            ...(data.examType ? { examType: data.examType } : {}),
            ...(data.status ? { status: data.status } : {}),
            ...(data.instructions !== undefined ? { instructions: data.instructions?.trim() || null } : {}),
            ...(data.regulations !== undefined ? { regulations: data.regulations?.trim() || null } : {}),
            ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
            ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
            ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update exam in DB: ${err.message}`);
      }
    }

    const exam = await this.findById(tenantId, examId);
    const updated = {
      ...exam,
      ...data,
      title: data.title || data.name || exam.title,
      name: data.name || data.title || exam.name,
      instructions: data.instructions !== undefined ? data.instructions : exam.instructions,
      regulations: data.regulations !== undefined ? data.regulations : exam.regulations,
      status: data.status || exam.status,
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.examinations.set(examId, updated);
    return updated;
  }

  async delete(tenantId: string, examId: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.examination.deleteMany({
          where: { id: examId, tenantId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete exam from DB: ${err.message}`);
      }
    }

    const exam = await this.findById(tenantId, examId);
    this.prisma.memoryStore.examinations.delete(examId);
    return { success: true, message: `Exam series "${exam.title}" deleted successfully.` };
  }

  async publish(tenantId: string, examId: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.examination.updateMany({
          where: { id: examId, tenantId },
          data: { isPublished: true, status: 'Published / Completed' },
        });
      } catch (err: any) {
        this.logger.warn(`Could not publish exam in DB: ${err.message}`);
      }
    }

    const exam = await this.findById(tenantId, examId);
    exam.isPublished = true;
    exam.status = 'Published / Completed';
    exam.moderationProgress = 100;
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);

    // Cross-Module Trigger: Dispatch Academic Result Notifications to Parents
    const examTitle = exam.title || exam.name || 'Terminal Examination';
    const notifTitle = `Examination Results Published: ${examTitle}`;
    const notifMessage = `Terminal examination results for "${examTitle}" have been approved and published. You can now view your child's report card and performance on the portal.`;

    let notifiedInDb = false;
    if (this.prisma.isDbConnected) {
      try {
        const studentParents = await this.prisma.studentParent.findMany({
          where: {
            student: {
              tenantId,
              status: 'ACTIVE',
              ...(exam.campusId ? { campusId: exam.campusId } : {}),
            },
          },
          include: {
            parent: {
              select: { userId: true },
            },
          },
        });

        if (studentParents.length > 0) {
          notifiedInDb = true;
          const parentUserIds = new Set<string>();
          for (const sp of studentParents) {
            if (sp.parent?.userId) parentUserIds.add(sp.parent.userId);
          }

          for (const pUserId of parentUserIds) {
            await this.prisma.inAppInboxItem.create({
              data: {
                id: `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
                tenantId,
                recipientUserId: pUserId,
                category: 'ACADEMIC',
                priority: 'HIGH',
                title: notifTitle,
                message: notifMessage,
                actionUrl: '/parent',
                isRead: false,
              },
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to dispatch DB academic result notifications: ${err.message}`);
      }
    }

    // Memory store fallback & synchronization
    const memory = this.prisma.memoryStore as any;
    if (memory && (!notifiedInDb || !this.prisma.isDbConnected)) {
      const parentUserIds = new Set<string>();
      const allParents = Array.from(memory.parents?.values() || []).filter(
        (p: any) => p.tenantId === tenantId,
      );
      for (const p of allParents as any[]) {
        const pUserId = p.userId || p.user?.id || `usr_${p.id}`;
        if (pUserId) parentUserIds.add(pUserId);
      }

      for (const pUserId of parentUserIds) {
        const inbId = `inb_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
        memory.inboxItems?.set(inbId, {
          id: inbId,
          tenantId,
          recipientUserId: pUserId,
          category: 'ACADEMIC',
          priority: 'HIGH',
          title: notifTitle,
          message: notifMessage,
          actionUrl: '/parent',
          isRead: false,
          createdAt: new Date(),
        });
      }
    }

    return exam;
  }

  // --- Exam Papers (ExamSchedule) ---
  async addPaper(tenantId: string, examId: string, paperData: any) {
    const paperId = paperData.id || `paper_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const examDate = paperData.date ? new Date(paperData.date) : new Date();

    if (this.prisma.isDbConnected) {
      try {
        // 1. Resolve class
        let classId = paperData.classId;
        if (!classId && paperData.classLevel) {
          const cls = await this.prisma.class.findFirst({
            where: {
              tenantId,
              OR: [{ id: paperData.classLevel }, { name: { equals: paperData.classLevel, mode: 'insensitive' } }],
            },
          });
          classId = cls?.id;
        }
        if (!classId) {
          const cls = await this.prisma.class.findFirst({ where: { tenantId } });
          classId = cls?.id;
        }

        // 2. Resolve subject
        let subjectId = paperData.subjectId;
        let subjectCode = paperData.paperCode;
        if (!subjectId && (paperData.subject || paperData.paperCode)) {
          const sub = await this.prisma.subject.findFirst({
            where: {
              tenantId,
              OR: [
                { id: paperData.subject },
                { name: { equals: paperData.subject, mode: 'insensitive' } },
                { code: { equals: paperData.paperCode || paperData.subject, mode: 'insensitive' } },
              ],
            },
          });
          subjectId = sub?.id;
          if (sub?.code && !subjectCode) subjectCode = sub.code;
        }
        if (!subjectId) {
          const sub = await this.prisma.subject.findFirst({ where: { tenantId } });
          subjectId = sub?.id;
          if (sub?.code && !subjectCode) subjectCode = sub.code;
        }

        // 3. Resolve Hall
        let hallId = paperData.hallId || null;
        let hallName = paperData.hall || null;
        if (hallId) {
          const hall = await this.prisma.examinationHall.findFirst({
            where: { id: hallId, tenantId },
          });
          if (hall) hallName = hall.name;
        } else if (paperData.hall) {
          const hall = await this.prisma.examinationHall.findFirst({
            where: { tenantId, name: { equals: paperData.hall, mode: 'insensitive' } },
          });
          if (hall) {
            hallId = hall.id;
            hallName = hall.name;
          }
        }

        // 4. Resolve Chief Invigilator
        let chiefInvigilatorId = paperData.chiefInvigilatorId || null;
        if (!chiefInvigilatorId && paperData.invigilator) {
          const staff = await this.prisma.staff.findFirst({
            where: {
              tenantId,
              OR: [
                { id: paperData.invigilator },
                { employeeNumber: paperData.invigilator },
                { firstName: { contains: paperData.invigilator.split(' ')[0] || '', mode: 'insensitive' } },
              ],
            },
          });
          if (staff) {
            chiefInvigilatorId = staff.id;
          } else {
            const teacher = await this.prisma.teacher.findFirst({
              where: {
                tenantId,
                OR: [
                  { id: paperData.invigilator },
                  { employeeNumber: paperData.invigilator },
                  { firstName: { contains: paperData.invigilator.split(' ')[0] || '', mode: 'insensitive' } },
                ],
              },
            });
            if (teacher) chiefInvigilatorId = teacher.id;
          }
        }

        // 5. Resolve Assistant Invigilator
        let assistantInvigilatorId = paperData.assistantInvigilatorId || null;
        if (!assistantInvigilatorId && paperData.assistantInvigilator) {
          const staff = await this.prisma.staff.findFirst({
            where: {
              tenantId,
              OR: [
                { id: paperData.assistantInvigilator },
                { employeeNumber: paperData.assistantInvigilator },
                { firstName: { contains: paperData.assistantInvigilator.split(' ')[0] || '', mode: 'insensitive' } },
              ],
            },
          });
          if (staff) {
            assistantInvigilatorId = staff.id;
          } else {
            const teacher = await this.prisma.teacher.findFirst({
              where: {
                tenantId,
                OR: [
                  { id: paperData.assistantInvigilator },
                  { employeeNumber: paperData.assistantInvigilator },
                  { firstName: { contains: paperData.assistantInvigilator.split(' ')[0] || '', mode: 'insensitive' } },
                ],
              },
            });
            if (teacher) assistantInvigilatorId = teacher.id;
          }
        }

        // 6. Resolve Candidate Count (auto count from enrollment if 0/empty)
        let candidatesCount = Number(paperData.candidatesCount);
        if (isNaN(candidatesCount) || candidatesCount <= 0) {
          if (classId) {
            candidatesCount = await this.prisma.enrollment.count({
              where: { tenantId, classId, status: 'ACTIVE' },
            });
          }
        }

        if (classId && subjectId) {
          await this.prisma.examSchedule.create({
            data: {
              id: paperId,
              examinationId: examId,
              classId,
              subjectId,
              hallId,
              hallName,
              chiefInvigilatorId,
              assistantInvigilatorId,
              paperCode: subjectCode || 'PAPER-01',
              candidatesCount: candidatesCount || 0,
              instructions: paperData.instructions?.trim() || null,
              weightPercentage: Number(paperData.weightPercentage) || 60,
              duration: paperData.duration?.trim() || '2h 30m',
              examDate,
              startTime: paperData.startTime || '09:00 AM',
              endTime: paperData.endTime || '11:30 AM',
              maxMarks: Number(paperData.maxMarks || paperData.maxScore) || 100,
              passMarks: Number(paperData.passMarks) || 40,
            },
          });
          this.logger.log(`Created ExamSchedule ${paperId} with real invigilators and hall in PostgreSQL`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not create exam schedule in DB: ${err.message}`);
      }
    }

    const exam = await this.findById(tenantId, examId);
    const newPaper = {
      ...paperData,
      id: paperId,
      examCycleId: examId,
      candidatesCount: Number(paperData.candidatesCount) || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!exam.papers) exam.papers = [];
    exam.papers.push(newPaper);
    exam.papersCount = exam.papers.length;
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return newPaper;
  }

  async updatePaper(tenantId: string, examId: string, paperId: string, paperData: any) {
    if (this.prisma.isDbConnected) {
      try {
        const updateData: any = {};
        if (paperData.date) updateData.examDate = new Date(paperData.date);
        if (paperData.startTime) updateData.startTime = paperData.startTime;
        if (paperData.endTime) updateData.endTime = paperData.endTime;
        if (paperData.duration) updateData.duration = paperData.duration;
        if (paperData.maxMarks || paperData.maxScore) updateData.maxMarks = Number(paperData.maxMarks || paperData.maxScore);
        if (paperData.passMarks) updateData.passMarks = Number(paperData.passMarks);
        if (paperData.weightPercentage) updateData.weightPercentage = Number(paperData.weightPercentage);
        if (paperData.candidatesCount !== undefined) updateData.candidatesCount = Number(paperData.candidatesCount);
        if (paperData.instructions !== undefined) updateData.instructions = paperData.instructions?.trim() || null;
        if (paperData.paperCode) updateData.paperCode = paperData.paperCode.trim();

        if (paperData.hallId !== undefined) updateData.hallId = paperData.hallId || null;
        if (paperData.chiefInvigilatorId !== undefined) updateData.chiefInvigilatorId = paperData.chiefInvigilatorId || null;
        if (paperData.assistantInvigilatorId !== undefined) updateData.assistantInvigilatorId = paperData.assistantInvigilatorId || null;

        await this.prisma.examSchedule.updateMany({
          where: { id: paperId, examinationId: examId },
          data: updateData,
        });
      } catch (err: any) {
        this.logger.warn(`Could not update exam schedule in DB: ${err.message}`);
      }
    }

    const exam = await this.findById(tenantId, examId);
    if (!exam.papers) exam.papers = [];
    const idx = exam.papers.findIndex((p: any) => p.id === paperId);
    if (idx >= 0) {
      exam.papers[idx] = { ...exam.papers[idx], ...paperData, updatedAt: new Date() };
    }
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return exam.papers[idx] || paperData;
  }

  async deletePaper(tenantId: string, examId: string, paperId: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.examSchedule.deleteMany({
          where: { id: paperId, examinationId: examId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete exam schedule from DB: ${err.message}`);
      }
    }

    const exam = await this.findById(tenantId, examId);
    if (!exam.papers) exam.papers = [];
    exam.papers = exam.papers.filter((p: any) => p.id !== paperId);
    exam.papersCount = exam.papers.length;
    exam.updatedAt = new Date();
    this.prisma.memoryStore.examinations.set(examId, exam);
    return { success: true, message: 'Paper removed' };
  }

  // --- Grading Scales ---
  async getGradingScales(tenantId: string) {
    if (this.prisma.isDbConnected) {
      try {
        const dbScales = await this.prisma.gradingScale.findMany({
          where: { tenantId },
          orderBy: { minScore: 'desc' },
        });

        if (dbScales.length > 0) {
          return dbScales;
        }
      } catch (err: any) {
        this.logger.warn(`Failed querying grading scales from DB: ${err.message}`);
      }
    }

    return Array.from(this.prisma.memoryStore.gradingScales.values()).filter(
      (g: any) => g.tenantId === tenantId,
    );
  }

  async createGradingScale(tenantId: string, data: any) {
    const id = `gs_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    if (this.prisma.isDbConnected) {
      try {
        const created = await this.prisma.gradingScale.create({
          data: {
            id,
            tenantId,
            name: data.name || `Grade ${data.grade}`,
            grade: data.grade,
            minScore: Number(data.minScore),
            maxScore: Number(data.maxScore),
            description: data.remark || data.description || 'Good',
            gradePoint: Number(data.gradePoint || 0),
          },
        });
        return created;
      } catch (err: any) {
        this.logger.warn(`Could not create grading scale in DB: ${err.message}`);
      }
    }

    const scale = {
      id,
      tenantId,
      ...data,
      name: data.name || `Grade ${data.grade}`,
      minScore: Number(data.minScore),
      maxScore: Number(data.maxScore),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.gradingScales.set(id, scale);
    return scale;
  }

  async updateGradingScale(tenantId: string, id: string, data: any) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.gradingScale.updateMany({
          where: { id, tenantId },
          data: {
            ...(data.name ? { name: data.name } : {}),
            ...(data.grade ? { grade: data.grade } : {}),
            ...(data.minScore !== undefined ? { minScore: Number(data.minScore) } : {}),
            ...(data.maxScore !== undefined ? { maxScore: Number(data.maxScore) } : {}),
            ...(data.description !== undefined || data.remark !== undefined
              ? { description: data.description || data.remark }
              : {}),
            ...(data.gradePoint !== undefined ? { gradePoint: Number(data.gradePoint) } : {}),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update grading scale in DB: ${err.message}`);
      }
    }

    const scale = Array.from(this.prisma.memoryStore.gradingScales.values()).find(
      (g: any) => g.id === id && g.tenantId === tenantId,
    );
    if (!scale) throw new NotFoundException('Grading scale not found');
    Object.assign(scale, data, { updatedAt: new Date() });
    return scale;
  }

  async deleteGradingScale(tenantId: string, id: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.gradingScale.deleteMany({
          where: { id, tenantId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete grading scale from DB: ${err.message}`);
      }
    }

    this.prisma.memoryStore.gradingScales.delete(id);
    return { success: true, message: 'Grading scale deleted' };
  }
}
