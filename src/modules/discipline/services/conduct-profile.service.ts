import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { ConductFilterDto } from '../dto/conduct-filter.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class ConductProfileService {
  private readonly logger = new Logger(ConductProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStudentConductProfile(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        campus: true,
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

    const cls = student.enrollments[0]?.class || null;
    const campus = student.campus;

    const [incidents, actions, rawDetentions, merits] = await Promise.all([
      this.prisma.disciplineIncident.findMany({
        where: { tenantId, studentId },
        orderBy: { incidentDate: 'desc' },
      }),
      this.prisma.disciplinaryAction.findMany({
        where: { tenantId, studentId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.detentionAssignment.findMany({
        where: { tenantId, studentId },
        include: { session: true },
      }),
      this.prisma.meritAward.findMany({
        where: { tenantId, studentId },
        orderBy: { awardDate: 'desc' },
      }),
    ]);

    const detentions = rawDetentions.map((d) => ({
      ...d,
      sessionTitle: d.session?.title || 'Detention Session',
      sessionDate: d.session?.date,
      sessionLocation: d.session?.location,
    }));

    const totalIncidents = incidents.length;
    const totalDemeritPoints = incidents.reduce((sum, i) => sum + (i.demeritPoints || 0), 0);
    const totalMeritAwards = merits.length;
    const totalMeritPoints = merits.reduce((sum, m) => sum + (m.meritPoints || 0), 0);
    const netConductPoints = totalMeritPoints - totalDemeritPoints;

    const standing = this.evaluatePastoralStanding(netConductPoints);
    const activeSanctionsCount = actions.filter((a) =>
      ['SCHEDULED', 'IN_PROGRESS'].includes(a.status),
    ).length;

    // Timeline merge
    const timeline = [
      ...incidents.map((i) => ({
        type: 'INCIDENT',
        id: i.id,
        title: i.title,
        category: i.category,
        severity: i.severity,
        points: -i.demeritPoints,
        date: i.incidentDate,
        status: i.status,
      })),
      ...merits.map((m) => ({
        type: 'MERIT',
        id: m.id,
        title: m.title,
        category: m.category,
        badgeTier: m.badgeTier,
        points: m.meritPoints,
        date: m.awardDate,
        status: 'AWARDED',
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      className: cls?.name || 'Class',
      campusName: campus?.name || 'Campus',
      totalIncidents,
      totalDemeritPoints,
      totalMeritAwards,
      totalMeritPoints,
      netConductPoints,
      standing,
      activeSanctionsCount,
      incidents,
      actions,
      detentions,
      merits,
      timeline,
    };
  }

  async getCampusConductSummary(tenantId: string, filter: ConductFilterDto) {
    const incWhere: any = { tenantId };
    const meritWhere: any = { tenantId };
    const detWhere: any = { tenantId };

    if (filter.campusId) {
      incWhere.campusId = filter.campusId;
      meritWhere.campusId = filter.campusId;
      detWhere.session = { campusId: filter.campusId };
    }
    if (filter.classId) {
      incWhere.classId = filter.classId;
      meritWhere.classId = filter.classId;
    }

    const [incidents, merits, detentions] = await Promise.all([
      this.prisma.disciplineIncident.findMany({ where: incWhere }),
      this.prisma.meritAward.findMany({ where: meritWhere }),
      this.prisma.detentionAssignment.findMany({ where: detWhere }),
    ]);

    const totalIncidents = incidents.length;
    const resolvedIncidents = incidents.filter((i) => i.status === 'RESOLVED').length;
    const pendingIncidents = incidents.filter((i) =>
      ['REPORTED', 'UNDER_INVESTIGATION', 'ACTION_PENDING'].includes(i.status),
    ).length;
    const totalDemeritPoints = incidents.reduce((sum, i) => sum + (i.demeritPoints || 0), 0);

    const totalMeritAwards = merits.length;
    const totalMeritPoints = merits.reduce((sum, m) => sum + (m.meritPoints || 0), 0);

    // Top infraction categories
    const categoryCounts: Record<string, number> = {};
    for (const i of incidents) {
      categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
    }
    const topInfractions = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Detention stats
    const totalDetentionAssigned = detentions.length;
    const detentionAttended = detentions.filter((d) => d.attendanceStatus === 'ATTENDED').length;
    const detentionAttendanceRate =
      totalDetentionAssigned > 0
        ? Math.round((detentionAttended / totalDetentionAssigned) * 100)
        : 100;

    return {
      totalIncidents,
      resolvedIncidents,
      pendingIncidents,
      totalDemeritPoints,
      totalMeritAwards,
      totalMeritPoints,
      topInfractions,
      totalDetentionAssigned,
      detentionAttended,
      detentionAttendanceRate,
    };
  }

  private evaluatePastoralStanding(netPoints: number): string {
    if (netPoints >= 15) return 'EXEMPLARY';
    if (netPoints >= 5) return 'GOOD';
    if (netPoints >= 0) return 'SATISFACTORY';
    if (netPoints >= -10) return 'NEEDS_IMPROVEMENT';
    return 'CRITICAL_PROBATION';
  }
}
