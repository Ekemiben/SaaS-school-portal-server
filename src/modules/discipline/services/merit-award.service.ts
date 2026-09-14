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
    const student = this.prisma.memoryStore.students.get(dto.studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const campusId = dto.campusId || student.campusId;
    const classId = dto.classId || student.classId;
    const classRecord = this.prisma.memoryStore.classes.get(classId);

    const id = `mrt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const merit = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.meritAwards.set(id, merit);

    return {
      ...merit,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      className: classRecord?.name || 'Class',
    };
  }

  async getMerits(tenantId: string, filter: MeritFilterDto) {
    let list = Array.from(this.prisma.memoryStore.meritAwards.values()).filter(
      (m) => m.tenantId === tenantId,
    );

    if (filter.studentId) list = list.filter((m) => m.studentId === filter.studentId);
    if (filter.classId) list = list.filter((m) => m.classId === filter.classId);
    if (filter.campusId) list = list.filter((m) => m.campusId === filter.campusId);
    if (filter.category) list = list.filter((m) => m.category === filter.category);
    if (filter.badgeTier) list = list.filter((m) => m.badgeTier === filter.badgeTier);

    return list
      .map((m) => {
        const student = this.prisma.memoryStore.students.get(m.studentId);
        const cls = this.prisma.memoryStore.classes.get(m.classId);
        return {
          ...m,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          admissionNumber: student?.admissionNumber || '',
          className: cls?.name || 'Class',
        };
      })
      .sort((a, b) => new Date(b.awardDate).getTime() - new Date(a.awardDate).getTime());
  }

  async getMeritById(tenantId: string, id: string) {
    const merit = this.prisma.memoryStore.meritAwards.get(id);
    if (!merit || merit.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Merit award record not found',
      });
    }

    const student = this.prisma.memoryStore.students.get(merit.studentId);
    const cls = this.prisma.memoryStore.classes.get(merit.classId);

    return {
      ...merit,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
      admissionNumber: student?.admissionNumber || '',
      className: cls?.name || 'Class',
    };
  }
}
