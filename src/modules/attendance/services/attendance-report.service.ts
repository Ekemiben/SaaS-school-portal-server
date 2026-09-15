import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class AttendanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyClassReport(tenantId: string, classId: string, date: string) {
    let targetClass = this.prisma.memoryStore.classes.get(classId);
    if (!targetClass) {
      targetClass = Array.from(this.prisma.memoryStore.classes.values()).find(
        (c: any) => c.tenantId === tenantId && (c.id === classId || c.name === classId),
      );
    }
    if (!targetClass || targetClass.tenantId !== tenantId) {
      throw new NotFoundException(`Class ${classId} not found in this school.`);
    }
    const resolvedClassId = targetClass.id;

    const dateKey = new Date(date).toISOString().split('T')[0];
    const records = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a: any) =>
        a.tenantId === tenantId &&
        (a.classId === resolvedClassId || a.classId === targetClass.name) &&
        (!a.subjectId || a.sessionType === 'DAILY') &&
        new Date(a.date).toISOString().split('T')[0] === dateKey,
    );

    const total = records.length;
    const present = records.filter((r: any) => r.status === 'PRESENT').length;
    const absent = records.filter((r: any) => r.status === 'ABSENT').length;
    const late = records.filter((r: any) => r.status === 'LATE').length;
    const excused = records.filter((r: any) => r.status === 'EXCUSED').length;

    const studentDetails = records.map((r: any) => {
      const student = this.prisma.memoryStore.students.get(r.studentId);
      return {
        recordId: r.id,
        studentId: r.studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
        admissionNumber: student?.admissionNumber || 'N/A',
        status: r.status,
        method: r.method,
        checkInTime: r.checkInTime,
        remarks: r.remarks,
      };
    });

    return {
      classId,
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
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) {
      throw new NotFoundException(`Student ${studentId} not found in this school.`);
    }

    let records = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a: any) => a.tenantId === tenantId && a.studentId === studentId,
    );

    if (query?.subjectId) {
      records = records.filter((a: any) => a.subjectId === query.subjectId);
    }
    if (query?.startDate) {
      const s = new Date(query.startDate);
      records = records.filter((a: any) => new Date(a.date) >= s);
    }
    if (query?.endDate) {
      const e = new Date(query.endDate);
      records = records.filter((a: any) => new Date(a.date) <= e);
    }

    const total = records.length;
    const present = records.filter((r: any) => r.status === 'PRESENT').length;
    const absent = records.filter((r: any) => r.status === 'ABSENT').length;
    const late = records.filter((r: any) => r.status === 'LATE').length;
    const excused = records.filter((r: any) => r.status === 'EXCUSED').length;

    return {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      admissionNumber: student.admissionNumber,
      totalSessions: total,
      presentCount: present,
      absentCount: absent,
      lateCount: late,
      excusedCount: excused,
      attendancePercentage: total > 0 ? Math.round(((present + late) / total) * 100) : 100,
      records: records.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  }

  async getSubjectAttendanceReport(tenantId: string, subjectId: string, classId?: string) {
    const subject = this.prisma.memoryStore.subjects.get(subjectId);
    if (!subject || subject.tenantId !== tenantId) {
      throw new NotFoundException(`Subject ${subjectId} not found in this school.`);
    }

    let records = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a: any) => a.tenantId === tenantId && a.subjectId === subjectId,
    );
    if (classId) {
      records = records.filter((a: any) => a.classId === classId);
    }

    const total = records.length;
    const present = records.filter((r: any) => r.status === 'PRESENT').length;
    const absent = records.filter((r: any) => r.status === 'ABSENT').length;
    const late = records.filter((r: any) => r.status === 'LATE').length;

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
    let incidents = Array.from(this.prisma.memoryStore.truancyIncidents.values()).filter(
      (t: any) => t.tenantId === tenantId,
    );
    if (campusId) {
      incidents = incidents.filter((t: any) => t.campusId === campusId);
    }

    return incidents.map((i: any) => {
      const student = this.prisma.memoryStore.students.get(i.studentId);
      const targetClass = this.prisma.memoryStore.classes.get(i.classId);
      return {
        ...i,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
        admissionNumber: student?.admissionNumber || 'N/A',
        className: targetClass?.name || 'Unknown',
      };
    }).sort((a: any, b: any) => new Date(b.dateDetected).getTime() - new Date(a.dateDetected).getTime());
  }
}
