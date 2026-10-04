import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateMeritAwardDto, MeritFilterDto } from '../dto/merit-award.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class MeritAwardService {
  private readonly logger = new Logger(MeritAwardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async awardMerit(
    tenantId: string,
    awarderUserId: string,
    dto: CreateMeritAwardDto,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { class: true },
          take: 1,
        },
      },
    });
    if (!student) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const campusId = dto.campusId || student.campusId;
    const classId = dto.classId || (student.enrollments[0]?.classId ?? student.campusId);
    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, tenantId },
    });

    const merit = await this.prisma.meritAward.create({
      data: {
        tenantId,
        campusId,
        classId,
        studentId: dto.studentId,
        academicYearId: dto.academicYearId || classRecord?.academicYearId || null,
        termId: dto.termId || null,
        awardedByUserId: awarderUserId,
        category: dto.category,
        title: dto.title,
        description: dto.description || null,
        meritPoints: dto.meritPoints ?? 1,
        badgeTier: dto.badgeTier || null,
        awardDate: dto.awardDate ? new Date(dto.awardDate) : new Date(),
        citationNotes: dto.citationNotes || null,
      },
    });

    return {
      ...merit,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      className: classRecord?.name || 'Class',
    };
  }

  async getMerits(tenantId: string, filter: MeritFilterDto) {
    const where: any = { tenantId };

    if (filter.studentId) where.studentId = filter.studentId;
    if (filter.classId) where.classId = filter.classId;
    if (filter.campusId) where.campusId = filter.campusId;
    if (filter.category) where.category = filter.category;
    if (filter.badgeTier) where.badgeTier = filter.badgeTier;

    const merits = await this.prisma.meritAward.findMany({
      where,
      include: {
        student: true,
        class: true,
      },
      orderBy: { awardDate: 'desc' },
    });

    return merits.map((m) => ({
      ...m,
      studentName: m.student ? `${m.student.firstName} ${m.student.lastName}` : 'Student',
      admissionNumber: m.student?.admissionNumber || '',
      className: m.class?.name || 'Class',
    }));
  }

  async getMeritById(tenantId: string, id: string) {
    const merit = await this.prisma.meritAward.findFirst({
      where: { id, tenantId },
      include: {
        student: true,
        class: true,
      },
    });
    if (!merit) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Merit award record not found',
      });
    }

    return {
      ...merit,
      studentName: merit.student ? `${merit.student.firstName} ${merit.student.lastName}` : 'Student',
      admissionNumber: merit.student?.admissionNumber || '',
      className: merit.class?.name || 'Class',
    };
  }
}
