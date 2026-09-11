import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

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
    }
    return { success: true, count: saved.length, records: saved };
  }
}
