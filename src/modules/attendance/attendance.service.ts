import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { QueueService } from '../../jobs/queue.service.js';
import { QUEUES, JOB_TYPES } from '../../jobs/queue.constants.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async getAttendance(
    tenantId: string,
    filters: { classId?: string; date?: string; studentId?: string },
  ) {
    let records = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a) => a.tenantId === tenantId,
    );

    if (filters.classId) {
      records = records.filter((a) => a.classId === filters.classId);
    }
    if (filters.studentId) {
      records = records.filter((a) => a.studentId === filters.studentId);
    }
    if (filters.date) {
      const targetDate = new Date(filters.date).toISOString().split('T')[0];
      records = records.filter((a) => new Date(a.date).toISOString().split('T')[0] === targetDate);
    }

    return records;
  }

  async markAttendance(
    tenantId: string,
    campusId: string,
    userId: string,
    data: {
      classId: string;
      date: string;
      records: Array<{ studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; remarks?: string }>;
    },
  ) {
    const saved = [];
    for (const r of data.records) {
      const id = `att_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      const record = {
        id,
        tenantId,
        campusId,
        studentId: r.studentId,
        classId: data.classId,
        date: new Date(data.date),
        status: r.status,
        remarks: r.remarks || null,
        markedByUserId: userId,
        createdAt: new Date(),
      };
      this.prisma.memoryStore.attendance.set(id, record);
      saved.push(record);

      // Trigger instant parent SMS/Email notification if student is ABSENT
      if (r.status === 'ABSENT') {
        const student = this.prisma.memoryStore.students.get(r.studentId);
        if (student) {
          const parent = student.parentId ? this.prisma.memoryStore.parents.get(student.parentId) : null;
          const recipient = parent?.phone || parent?.email || 'parent@example.com';
          const channel = parent?.phone ? 'sms' : 'email';
          this.queueService.addJob(
            QUEUES.NOTIFICATIONS,
            channel === 'sms' ? JOB_TYPES.SEND_SMS : JOB_TYPES.SEND_EMAIL,
            {
              channel,
              tenantId,
              recipient,
              subject: `Absence Alert: ${student.firstName} ${student.lastName}`,
              body: `Dear Parent, please be notified that ${student.firstName} ${student.lastName} was marked ABSENT on ${data.date}. Remarks: ${r.remarks || 'None'}.`,
              metadata: { studentId: r.studentId, date: data.date },
            },
            { attempts: 3, backoffDelay: 1000 },
          ).catch(() => {});
        }
      }
    }
    return { success: true, count: saved.length, records: saved };
  }

  async getStatistics(tenantId: string, classId?: string) {
    const records = Array.from(this.prisma.memoryStore.attendance.values()).filter(
      (a) => a.tenantId === tenantId && (!classId || a.classId === classId),
    );

    const total = records.length;
    if (total === 0) {
      return {
        totalRecords: 0,
        presentRate: 100,
        absentRate: 0,
        lateRate: 0,
        chronicAbsentees: [],
      };
    }

    const presentCount = records.filter((r) => r.status === 'PRESENT').length;
    const absentCount = records.filter((r) => r.status === 'ABSENT').length;
    const lateCount = records.filter((r) => r.status === 'LATE').length;

    // Identify chronic absentees (> 3 absences)
    const absentPerStudent = new Map<string, number>();
    for (const r of records) {
      if (r.status === 'ABSENT') {
        absentPerStudent.set(r.studentId, (absentPerStudent.get(r.studentId) || 0) + 1);
      }
    }

    const chronicAbsentees = [];
    for (const [studentId, count] of absentPerStudent.entries()) {
      if (count >= 2) {
        const student = this.prisma.memoryStore.students.get(studentId);
        chronicAbsentees.push({
          studentId,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Student',
          absenceCount: count,
        });
      }
    }

    return {
      totalRecords: total,
      presentRate: Math.round((presentCount / total) * 100),
      absentRate: Math.round((absentCount / total) * 100),
      lateRate: Math.round((lateCount / total) * 100),
      chronicAbsentees,
    };
  }
}
