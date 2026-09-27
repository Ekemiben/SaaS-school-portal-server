import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class ExaminationsService {
  private readonly logger = new Logger(ExaminationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

          return exams.map((e) => ({
            id: e.id,
            tenantId: e.tenantId,
            campusId: e.campusId,
            campus: e.campus?.name || 'Main Campus',
            academicYearId: e.academicYearId,
            termId: e.termId,
            title: e.name,
            name: e.name,
            examType: e.examType || 'Terminal Examination',
            session: e.academicYear?.name || '2024/2025',
            term: e.term?.name || 'First Term',
            startDate: e.startDate,
            endDate: e.endDate,
            status: e.isPublished ? 'Published / Completed' : 'Scheduled',
            isPublished: e.isPublished,
            registeredCandidates: studentCount || 0,
            hallCount: 1,
            papersCount: e.schedules.length,
            moderationProgress: e.isPublished ? 100 : 0,
            papers: e.schedules.map((s) => ({
              id: s.id,
              examCycleId: s.examinationId,
              subjectId: s.subjectId,
              subject: s.subject?.name || 'Subject',
              classId: s.classId,
              classLevel: s.class?.name || 'Class',
              date: s.examDate ? s.examDate.toISOString().split('T')[0] : '',
              startTime: s.startTime,
              endTime: s.endTime,
              maxMarks: s.maxMarks,
              passMarks: s.passMarks,
              paperCode: s.subject?.code || 'PAPER',
              hall: 'Hall A',
              invigilator: 'Staff Invigilator',
            })),
            createdAt: e.createdAt,
          }));
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
        session: e.session || '2024/2025',
        term: e.term || 'First Term',
        papersCount: e.papers ? e.papers.length : e.papersCount || 0,
        hallCount: e.hallCount || 3,
        status: e.status || (e.isPublished ? 'Published / Completed' : 'Scheduled'),
        registeredCandidates: e.registeredCandidates || 540,
        moderationProgress: e.moderationProgress || 0,
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
              },
            },
          },
        });

        if (exam) {
          return {
            id: exam.id,
            tenantId: exam.tenantId,
            campusId: exam.campusId,
            academicYearId: exam.academicYearId,
            termId: exam.termId,
            title: exam.name,
            name: exam.name,
            examType: exam.examType,
            session: exam.academicYear?.name || '2024/2025',
            term: exam.term?.name || 'First Term',
            startDate: exam.startDate,
            endDate: exam.endDate,
            status: exam.isPublished ? 'Published / Completed' : 'Scheduled',
            isPublished: exam.isPublished,
            papersCount: exam.schedules.length,
            papers: exam.schedules.map((s) => ({
              id: s.id,
              examCycleId: s.examinationId,
              subjectId: s.subjectId,
              subject: s.subject?.name || 'Subject',
              classId: s.classId,
              classLevel: s.class?.name || 'Class',
              date: s.examDate ? s.examDate.toISOString().split('T')[0] : '',
              startTime: s.startTime,
              endTime: s.endTime,
              maxMarks: s.maxMarks,
              passMarks: s.passMarks,
              paperCode: s.subject?.code || 'PAPER',
              hall: 'Hall A',
              invigilator: 'Staff Invigilator',
            })),
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed querying exam ${examId} from DB: ${err.message}`);
      }
    }

    const exam = this.prisma.memoryStore.examinations.get(examId);
    if (!exam || exam.tenantId !== tenantId) {
      throw new NotFoundException('Examination not found');
    }
    return {
      ...exam,
      title: exam.title || exam.name,
      papersCount: exam.papers ? exam.papers.length : exam.papersCount || 0,
      papers: exam.papers || [],
    };
  }

  async create(tenantId: string, data: any) {
    const id = data.id || `exam_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const title = data.title || data.name || 'Terminal Examination';
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const endDate = data.endDate ? new Date(data.endDate) : new Date(Date.now() + 14 * 86400000);

    let campusId = data.campusId;
    let academicYearId = data.academicYearId;
    let termId = data.termId;

    if (this.prisma.isDbConnected) {
      try {
        if (!campusId) {
          const defaultCampus = await this.prisma.campus.findFirst({ where: { tenantId } });
          campusId = defaultCampus?.id;
        }
        if (!academicYearId) {
          const matchedYear = data.session
            ? await this.prisma.academicYear.findFirst({ where: { tenantId, name: { contains: data.session, mode: 'insensitive' } } })
            : null;
          const defaultYear = matchedYear || (await this.prisma.academicYear.findFirst({ where: { tenantId, isCurrent: true } })) || (await this.prisma.academicYear.findFirst({ where: { tenantId } }));
          academicYearId = defaultYear?.id;
        }
        if (!termId) {
          const matchedTerm = data.term
            ? await this.prisma.term.findFirst({ where: { tenantId, name: { contains: data.term, mode: 'insensitive' } } })
            : null;
          const defaultTerm = matchedTerm || (await this.prisma.term.findFirst({ where: { tenantId, isCurrent: true } })) || (await this.prisma.term.findFirst({ where: { tenantId } }));
          termId = defaultTerm?.id;
        }

        if (campusId && academicYearId && termId) {
          const created = await this.prisma.examination.create({
            data: {
              id,
              tenantId,
              campusId,
              academicYearId,
              termId,
              name: title,
              examType: data.examType || 'TERM_EXAM',
              startDate,
              endDate,
              isPublished: data.status === 'Published / Completed' || !!data.isPublished,
            },
          });
          this.logger.log(`Created examination ${id} in PostgreSQL`);
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
      session: data.session || '2024/2025',
      term: data.term || 'First Term',
      startDate,
      endDate,
      status: data.status || 'Scheduled',
      registeredCandidates: data.registeredCandidates || 540,
      hallCount: data.hallCount || 3,
      papersCount: data.papers ? data.papers.length : data.papersCount || 0,
      moderationProgress: data.moderationProgress || 0,
      instructions: data.instructions || '',
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
          data: { isPublished: true },
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
    return exam;
  }

  // --- Exam Papers (ExamSchedule) ---
  async addPaper(tenantId: string, examId: string, paperData: any) {
    const paperId = paperData.id || `paper_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const examDate = paperData.date ? new Date(paperData.date) : new Date();

    if (this.prisma.isDbConnected) {
      try {
        let classId = paperData.classId;
        let subjectId = paperData.subjectId;

        if (!classId && paperData.classLevel) {
          const cls = await this.prisma.class.findFirst({
            where: { tenantId, name: paperData.classLevel },
          });
          classId = cls?.id;
        }
        if (!classId) {
          const cls = await this.prisma.class.findFirst({ where: { tenantId } });
          classId = cls?.id;
        }

        if (!subjectId && (paperData.subject || paperData.paperCode)) {
          const sub = await this.prisma.subject.findFirst({
            where: {
              tenantId,
              OR: [
                { name: paperData.subject },
                { code: paperData.paperCode || paperData.subject },
              ],
            },
          });
          subjectId = sub?.id;
        }
        if (!subjectId) {
          const sub = await this.prisma.subject.findFirst({ where: { tenantId } });
          subjectId = sub?.id;
        }

        if (classId && subjectId) {
          await this.prisma.examSchedule.create({
            data: {
              id: paperId,
              examinationId: examId,
              classId,
              subjectId,
              examDate,
              startTime: paperData.startTime || '09:00 AM',
              endTime: paperData.endTime || '11:00 AM',
              maxMarks: Number(paperData.maxMarks) || 100,
              passMarks: Number(paperData.passMarks) || 40,
            },
          });
          this.logger.log(`Created ExamSchedule ${paperId} in PostgreSQL`);
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
        await this.prisma.examSchedule.updateMany({
          where: { id: paperId, examinationId: examId },
          data: {
            ...(paperData.date ? { examDate: new Date(paperData.date) } : {}),
            ...(paperData.startTime ? { startTime: paperData.startTime } : {}),
            ...(paperData.endTime ? { endTime: paperData.endTime } : {}),
            ...(paperData.maxMarks ? { maxMarks: Number(paperData.maxMarks) } : {}),
            ...(paperData.passMarks ? { passMarks: Number(paperData.passMarks) } : {}),
          },
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
          // Group by scale name
          const scaleGroups = new Map<string, any>();
          for (const scale of dbScales) {
            if (!scaleGroups.has(scale.name)) {
              scaleGroups.set(scale.name, {
                id: scale.id,
                tenantId: scale.tenantId,
                name: scale.name,
                code: scale.name.toUpperCase().replace(/\s+/g, '_'),
                description: scale.description || '',
                division: 'School Standard',
                passThreshold: 40,
                bands: [],
              });
            }
            scaleGroups.get(scale.name).bands.push({
              id: scale.id,
              symbol: scale.grade,
              grade: scale.grade,
              minScore: scale.minScore,
              maxScore: scale.maxScore,
              gradePoint: scale.gradePoint,
              remark: scale.description || scale.grade,
            });
          }
          return Array.from(scaleGroups.values());
        }
      } catch (err: any) {
        this.logger.warn(`Could not query grading scales from DB: ${err.message}`);
      }
    }

    const custom = Array.from(this.prisma.memoryStore.gradingScales.values()).filter(
      (gs) => gs.tenantId === tenantId,
    );

    if (custom.length > 0) return custom;

    return [
      {
        id: 'scale_waec',
        tenantId,
        name: 'WAEC / WASSCE Standard 9-Point Scale',
        code: 'WAEC_9P',
        description: 'Standard West African Examinations Council grading scale used for Senior Secondary.',
        division: 'Senior Secondary (SSS 1 - SSS 3)',
        passThreshold: 50,
        bands: [
          { id: 'b1', symbol: 'A1', minScore: 75, maxScore: 100, gradePoint: 4.0, remark: 'Excellent / Distinction', badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { id: 'b2', symbol: 'B2', minScore: 70, maxScore: 74, gradePoint: 3.6, remark: 'Very Good', badgeColor: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { id: 'b3', symbol: 'B3', minScore: 65, maxScore: 69, gradePoint: 3.2, remark: 'Good', badgeColor: 'text-teal-700 bg-teal-50 border-teal-200' },
          { id: 'b4', symbol: 'C4', minScore: 60, maxScore: 64, gradePoint: 2.8, remark: 'Credit (High)', badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
          { id: 'b5', symbol: 'C5', minScore: 55, maxScore: 59, gradePoint: 2.4, remark: 'Credit (Middle)', badgeColor: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
          { id: 'b6', symbol: 'C6', minScore: 50, maxScore: 54, gradePoint: 2.0, remark: 'Credit (Pass)', badgeColor: 'text-blue-700 bg-blue-50 border-blue-200' },
          { id: 'b7', symbol: 'D7', minScore: 45, maxScore: 49, gradePoint: 1.6, remark: 'Pass (Weak)', badgeColor: 'text-amber-700 bg-amber-50 border-amber-200' },
          { id: 'b8', symbol: 'E8', minScore: 40, maxScore: 44, gradePoint: 1.2, remark: 'Pass (Marginal)', badgeColor: 'text-orange-700 bg-orange-50 border-orange-200' },
          { id: 'b9', symbol: 'F9', minScore: 0, maxScore: 39, gradePoint: 0.0, remark: 'Fail', badgeColor: 'text-rose-700 bg-rose-50 border-rose-200' },
        ],
      },
    ];
  }

  async createGradingScale(tenantId: string, data: any) {
    const id = data.id || `gs_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const bands = data.bands || data.rules || [];

    if (this.prisma.isDbConnected && bands.length > 0) {
      try {
        for (const band of bands) {
          const bandId = band.id || `scale_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
          await this.prisma.gradingScale.upsert({
            where: {
              tenantId_name_grade: {
                tenantId,
                name: data.name || 'Standard Scale',
                grade: band.symbol || band.grade || 'A',
              },
            },
            update: {
              minScore: Number(band.minScore) || 0,
              maxScore: Number(band.maxScore) || 100,
              gradePoint: Number(band.gradePoint) || 0,
              description: band.remark || band.description || null,
            },
            create: {
              id: bandId,
              tenantId,
              name: data.name || 'Standard Scale',
              grade: band.symbol || band.grade || 'A',
              minScore: Number(band.minScore) || 0,
              maxScore: Number(band.maxScore) || 100,
              gradePoint: Number(band.gradePoint) || 0,
              description: band.remark || band.description || null,
            },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not save grading scale in DB: ${err.message}`);
      }
    }

    const scale = {
      id,
      tenantId,
      name: data.name,
      code: data.code || data.name.toUpperCase().replace(/\s+/g, '_'),
      description: data.description || '',
      division: data.division || 'Senior Secondary',
      passThreshold: Number(data.passThreshold) || 50,
      bands,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.prisma.memoryStore.gradingScales.set(id, scale);
    return scale;
  }

  async updateGradingScale(tenantId: string, scaleId: string, data: any) {
    const bands = data.bands || data.rules || [];
    if (this.prisma.isDbConnected && bands.length > 0) {
      try {
        for (const band of bands) {
          const bandId = band.id || `scale_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
          await this.prisma.gradingScale.upsert({
            where: {
              tenantId_name_grade: {
                tenantId,
                name: data.name || 'Standard Scale',
                grade: band.symbol || band.grade || 'A',
              },
            },
            update: {
              minScore: Number(band.minScore) || 0,
              maxScore: Number(band.maxScore) || 100,
              gradePoint: Number(band.gradePoint) || 0,
              description: band.remark || band.description || null,
            },
            create: {
              id: bandId,
              tenantId,
              name: data.name || 'Standard Scale',
              grade: band.symbol || band.grade || 'A',
              minScore: Number(band.minScore) || 0,
              maxScore: Number(band.maxScore) || 100,
              gradePoint: Number(band.gradePoint) || 0,
              description: band.remark || band.description || null,
            },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Could not update grading scale in DB: ${err.message}`);
      }
    }

    let scale = this.prisma.memoryStore.gradingScales.get(scaleId);
    if (!scale || scale.tenantId !== tenantId) {
      scale = {
        id: scaleId,
        tenantId,
        name: data.name || 'Grading Scale',
        code: data.code || 'SCALE',
        description: data.description || '',
        division: data.division || 'Senior Secondary',
        passThreshold: Number(data.passThreshold) || 50,
        bands,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      Object.assign(scale, data, {
        bands: bands.length > 0 ? bands : scale.bands,
        updatedAt: new Date(),
      });
    }
    this.prisma.memoryStore.gradingScales.set(scaleId, scale);
    return scale;
  }

  async deleteGradingScale(tenantId: string, scaleId: string) {
    if (this.prisma.isDbConnected) {
      try {
        await this.prisma.gradingScale.deleteMany({
          where: { tenantId, id: scaleId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete grading scale from DB: ${err.message}`);
      }
    }
    this.prisma.memoryStore.gradingScales.delete(scaleId);
    return { success: true, message: 'Grading scale deleted' };
  }
}
