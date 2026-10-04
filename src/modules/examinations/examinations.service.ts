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
  }

  async getExamHallById(tenantId: string, id: string) {
    const hall = await this.prisma.examinationHall.findFirst({
      where: { id, tenantId },
      include: {
        campus: { select: { id: true, name: true, code: true } },
      },
    });
    if (!hall) throw new NotFoundException(`Examination hall "${id}" not found.`);
    return hall;
  }

  async createExamHall(
    tenantId: string,
    data: { name: string; campusId?: string; building?: string; roomNumber?: string; capacity?: number },
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('Hall name is required.');

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

  async updateExamHall(
    tenantId: string,
    id: string,
    data: { name?: string; campusId?: string | null; building?: string; roomNumber?: string; capacity?: number },
  ) {
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

  async deleteExamHall(tenantId: string, id: string) {
    const existing = await this.prisma.examinationHall.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`Examination hall "${id}" not found.`);

    await this.prisma.examSchedule.updateMany({
      where: { hallId: id },
      data: { hallId: null },
    });

    await this.prisma.examinationHall.delete({ where: { id } });
    return { success: true, message: `Examination hall "${existing.name}" removed successfully.` };
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

  async findById(tenantId: string, examId: string) {
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

    if (!exam) {
      throw new NotFoundException('Examination not found in this school');
    }

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

  async create(tenantId: string, data: any) {
    const id = `exam_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const title = data.title || data.name || 'Terminal Examination Series';
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const endDate = data.endDate ? new Date(data.endDate) : new Date(Date.now() + 14 * 86400000);

    let campusId = data.campusId;
    let academicYearId = data.academicYearId;
    let termId = data.termId;

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
        const ay = (await this.prisma.academicYear.findFirst({
          where: { tenantId, isCurrent: true },
        })) || (await this.prisma.academicYear.findFirst({ where: { tenantId } }));
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

    if (!campusId || !academicYearId || !termId) {
      throw new BadRequestException('Campus, Academic Year, and Term must be configured before creating examinations.');
    }

    const created = await this.prisma.examination.create({
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
    return this.findById(tenantId, created.id);
  }

  async update(tenantId: string, examId: string, data: any) {
    const existing = await this.prisma.examination.findFirst({
      where: { id: examId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Examination not found');
    }

    await this.prisma.examination.update({
      where: { id: examId },
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

    return this.findById(tenantId, examId);
  }

  async delete(tenantId: string, examId: string) {
    const existing = await this.prisma.examination.findFirst({
      where: { id: examId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Examination not found');
    }

    await this.prisma.examination.delete({
      where: { id: examId },
    });

    return { success: true, message: `Exam series "${existing.name}" deleted successfully.` };
  }

  async publish(tenantId: string, examId: string) {
    const existing = await this.prisma.examination.findFirst({
      where: { id: examId, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Examination not found');
    }

    await this.prisma.examination.update({
      where: { id: examId },
      data: { isPublished: true, status: 'Published / Completed' },
    });

    // Cross-Module Trigger: Dispatch Academic Result Notifications to Parents
    const examTitle = existing.name || 'Terminal Examination';
    const notifTitle = `Examination Results Published: ${examTitle}`;
    const notifMessage = `Terminal examination results for "${examTitle}" have been approved and published. You can now view your child's report card and performance on the portal.`;

    try {
      const studentParents = await this.prisma.studentParent.findMany({
        where: {
          student: {
            tenantId,
            status: 'ACTIVE',
            ...(existing.campusId ? { campusId: existing.campusId } : {}),
          },
        },
        include: {
          parent: {
            select: { userId: true },
          },
        },
      });

      if (studentParents.length > 0) {
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

    return this.findById(tenantId, examId);
  }

  // --- Exam Papers (ExamSchedule) ---
  async addPaper(tenantId: string, examId: string, paperData: any) {
    const exam = await this.prisma.examination.findFirst({
      where: { id: examId, tenantId },
    });
    if (!exam) {
      throw new NotFoundException('Examination not found');
    }

    const paperId = paperData.id || `paper_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const examDate = paperData.date ? new Date(paperData.date) : new Date();

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
    if (!classId) {
      throw new BadRequestException('Class is required to schedule an exam paper.');
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
    if (!subjectId) {
      throw new BadRequestException('Subject is required to schedule an exam paper.');
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

    const created = await this.prisma.examSchedule.create({
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
      include: {
        subject: true,
        class: true,
        hall: true,
        chiefInvigilator: true,
        assistantInvigilator: true,
      },
    });

    this.logger.log(`Created ExamSchedule ${paperId} with real invigilators and hall in PostgreSQL`);
    return this.formatSchedule(created);
  }

  async updatePaper(tenantId: string, examId: string, paperId: string, paperData: any) {
    const schedule = await this.prisma.examSchedule.findFirst({
      where: { id: paperId, examinationId: examId },
    });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule ${paperId} not found.`);
    }

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

    const updated = await this.prisma.examSchedule.update({
      where: { id: paperId },
      data: updateData,
      include: {
        subject: true,
        class: true,
        hall: true,
        chiefInvigilator: true,
        assistantInvigilator: true,
      },
    });

    return this.formatSchedule(updated);
  }

  async deletePaper(tenantId: string, examId: string, paperId: string) {
    const schedule = await this.prisma.examSchedule.findFirst({
      where: { id: paperId, examinationId: examId },
    });
    if (!schedule) {
      throw new NotFoundException(`Exam schedule ${paperId} not found.`);
    }

    await this.prisma.examSchedule.delete({
      where: { id: paperId },
    });

    return { success: true, message: 'Paper removed' };
  }

  // --- Grading Scales ---
  async getGradingScales(tenantId: string) {
    return await this.prisma.gradingScale.findMany({
      where: { tenantId },
      orderBy: { minScore: 'desc' },
    });
  }

  async createGradingScale(tenantId: string, data: any) {
    const id = `gs_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    return await this.prisma.gradingScale.create({
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
  }

  async updateGradingScale(tenantId: string, id: string, data: any) {
    const existing = await this.prisma.gradingScale.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Grading scale not found');
    }

    return await this.prisma.gradingScale.update({
      where: { id },
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
  }

  async deleteGradingScale(tenantId: string, id: string) {
    const existing = await this.prisma.gradingScale.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Grading scale not found');
    }

    await this.prisma.gradingScale.delete({
      where: { id },
    });

    return { success: true, message: 'Grading scale deleted' };
  }
}
