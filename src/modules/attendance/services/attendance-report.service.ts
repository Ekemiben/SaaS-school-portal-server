import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyClassReport(tenantId: string, classId: string, date: string) {
    const targetClass = await this.prisma.class.findFirst({
      where: {
        tenantId,
        OR: [{ id: classId }, { name: classId }],
      },
    });

    if (!targetClass) {
      throw new NotFoundException(`Class ${classId} not found in this school.`);
    }
    const resolvedClassId = targetClass.id;
    const dateKey = new Date(date).toISOString().split('T')[0];

    const d = new Date(date);
    const startOfDay = new Date(d);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const records = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        classId: resolvedClassId,
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        student: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const excused = records.filter((r) => r.status === 'EXCUSED').length;

    const studentDetails = records.map((r) => ({
      recordId: r.id,
      studentId: r.studentId,
      studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : 'Unknown',
      admissionNumber: r.student?.admissionNumber || 'N/A',
      status: r.status,
      method: r.method,
      checkInTime: r.checkInTime,
      remarks: r.remarks,
    }));

    return {
      classId: resolvedClassId,
      className: targetClass.name,
      date: dateKey,
      totalStudentsRecorded: total,
      presentCount: present,
      absentCount: absent,
      lateCount: late,
      excusedCount: excused,
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 100,
      students: studentDetails,
    };
  }

  async getStudentAttendanceHistory(tenantId: string, studentId: string, query?: { startDate?: string; endDate?: string; subjectId?: string }) {
    const student = await this.prisma.student.findFirst({
      where: { tenantId, id: studentId },
    });

    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found in this school.`);
    }

    const where: any = { tenantId, studentId };
    if (query?.subjectId) where.subjectId = query.subjectId;
    if (query?.startDate || query?.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(query.endDate);
    }

    const records = await this.prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const excused = records.filter((r) => r.status === 'EXCUSED').length;

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      totalSessions: total,
      presentCount: present,
      absentCount: absent,
      lateCount: late,
      excusedCount: excused,
      attendancePercentage: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      records,
    };
  }

  async getSubjectAttendanceReport(tenantId: string, subjectId: string, classId?: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { tenantId, id: subjectId },
    });

    if (!subject) {
      throw new NotFoundException(`Subject ${subjectId} not found in this school.`);
    }

    const where: any = { tenantId, subjectId };
    if (classId) where.classId = classId;

    const records = await this.prisma.attendance.findMany({ where });
    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;

    return {
      subjectId,
      subjectName: subject.name,
      subjectCode: subject.code,
      classId: classId || 'ALL',
      totalRecords: total,
      presentCount: present,
      absentCount: absent,
      lateCount: late,
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 100,
    };
  }

  async getTruancySummary(tenantId: string, campusId?: string) {
    const where: any = { tenantId };
    if (campusId) where.campusId = campusId;

    const incidents = await this.prisma.truancyIncident.findMany({
      where,
      include: {
        student: true,
        class: true,
      },
      orderBy: { dateDetected: 'desc' },
    });

    return incidents.map((i) => ({
      ...i,
      studentName: i.student ? `${i.student.firstName} ${i.student.lastName}` : 'Unknown',
      admissionNumber: i.student?.admissionNumber || 'N/A',
      className: i.class?.name || 'Unknown',
    }));
  }
}
