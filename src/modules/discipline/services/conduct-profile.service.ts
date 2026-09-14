import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { ConductFilterDto } from '../dto/conduct-filter.dto.js';
import { ErrorCodes } from '../../../common/constants/error-codes.js';

@Injectable()
export class ConductProfileService {
  private readonly logger = new Logger(ConductProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStudentConductProfile(tenantId: string, studentId: string) {
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException({
        errorCode: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Student not found in this school',
      });
    }

    const cls = this.prisma.memoryStore.classes.get(student.classId);
    const campus = this.prisma.memoryStore.campuses.get(student.campusId);

    // Incidents
    const incidents = Array.from(this.prisma.memoryStore.disciplineIncidents.values())
      .filter((i) => i.tenantId === tenantId && i.studentId === studentId)
      .sort((a, b) => new Date(b.incidentDate).getTime() - new Date(a.incidentDate).getTime());

    // Disciplinary Actions
    const actions = Array.from(this.prisma.memoryStore.disciplinaryActions.values())
      .filter((a) => a.tenantId === tenantId && a.studentId === studentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Detention Assignments
    const detentions = Array.from(this.prisma.memoryStore.detentionAssignments.values())
      .filter((d) => d.tenantId === tenantId && d.studentId === studentId)
      .map((d) => {
        const session = this.prisma.memoryStore.detentionSessions.get(d.sessionId);
        return {
          ...d,
          sessionTitle: session?.title || 'Detention Session',
          sessionDate: session?.date,
          sessionLocation: session?.location,
        };
      });

    // Merits
    const merits = Array.from(this.prisma.memoryStore.meritAwards.values())
      .filter((m) => m.tenantId === tenantId && m.studentId === studentId)
      .sort((a, b) => new Date(b.awardDate).getTime() - new Date(a.awardDate).getTime());

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
    let incidents = Array.from(this.prisma.memoryStore.disciplineIncidents.values()).filter(
      (i) => i.tenantId === tenantId,
    );
    let merits = Array.from(this.prisma.memoryStore.meritAwards.values()).filter(
      (m) => m.tenantId === tenantId,
    );
    let detentions = Array.from(this.prisma.memoryStore.detentionAssignments.values()).filter(
      (d) => d.tenantId === tenantId,
    );

    if (filter.campusId) {
      incidents = incidents.filter((i) => i.campusId === filter.campusId);
      merits = merits.filter((m) => m.campusId === filter.campusId);
    }
    if (filter.classId) {
      incidents = incidents.filter((i) => i.classId === filter.classId);
      merits = merits.filter((m) => m.classId === filter.classId);
    }

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
