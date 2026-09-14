import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BullmqService } from '../../../jobs/bullmq.service.js';
import { QUEUES, JOB_TYPES } from '../../../jobs/queue.constants.js';
import { AttendanceConfigService } from './attendance-config.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class AttendanceTruancyService {
  private readonly logger = new Logger(AttendanceTruancyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmqService: BullmqService,
    private readonly configService: AttendanceConfigService,
  ) {}

  async evaluateStudentAbsence(
    tenantId: string,
    campusId: string,
    studentId: string,
    classId: string,
    date: Date,
    remarks?: string,
  ) {
    const config = await this.configService.getConfig(tenantId);
    const student = this.prisma.memoryStore.students.get(studentId);
    if (!student || student.tenantId !== tenantId) return;

    // 1. Dispatch Immediate Daily Absence Alert if configured
    if (config.autoNotifyParentsOnAbsence) {
      await this.dispatchParentAlert(tenantId, campusId, student, {
        type: 'ABSENCE',
        date: date.toISOString().split('T')[0],
        remarks: remarks || 'Not specified',
      });
    }

    // 2. Evaluate Consecutive Absences for Truancy
    const allStudentRecords = Array.from(this.prisma.memoryStore.attendance.values())
      .filter((a: any) => a.tenantId === tenantId && a.studentId === studentId && (a.sessionType === 'DAILY' || !a.sessionType))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let consecutiveAbsences = 0;
    for (const r of allStudentRecords) {
      if (r.status === 'ABSENT') {
        consecutiveAbsences++;
      } else if (r.status === 'PRESENT' || r.status === 'LATE') {
        break;
      }
    }

    if (consecutiveAbsences >= config.consecutiveAbsenceThreshold) {
      await this.recordTruancyIncident(tenantId, campusId, studentId, classId, {
        incidentType: 'CONSECUTIVE_ABSENCE',
        severity: consecutiveAbsences >= 5 ? 'HIGH' : 'MEDIUM',
        triggerValue: consecutiveAbsences,
        thresholdValue: config.consecutiveAbsenceThreshold,
      });

      if (config.autoNotifyParentsOnTruancy) {
        await this.dispatchParentAlert(tenantId, campusId, student, {
          type: 'TRUANCY_WARNING',
          date: date.toISOString().split('T')[0],
          details: `Student has accrued ${consecutiveAbsences} consecutive unexcused absences.`,
        });
      }
    }
  }

  async recordTruancyIncident(
    tenantId: string,
    campusId: string,
    studentId: string,
    classId: string,
    data: {
      incidentType: string;
      severity: string;
      triggerValue: number;
      thresholdValue: number;
    },
  ) {
    const id = `tru_${randomUUID().replace(/-/g, '').substring(0, 10)}`;
    const incident = {
      id,
      tenantId,
      campusId,
      studentId,
      classId,
      incidentType: data.incidentType,
      severity: data.severity,
      triggerValue: data.triggerValue,
      thresholdValue: data.thresholdValue,
      dateDetected: new Date(),
      parentNotified: true,
      status: 'OPEN',
      resolutionNotes: null,
      resolvedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.truancyIncidents.set(id, incident);
    this.logger.warn(`Truancy incident ${id} (${data.incidentType}) recorded for student ${studentId} (Threshold: ${data.thresholdValue}, Trigger: ${data.triggerValue})`);
    return incident;
  }

  async dispatchParentAlert(
    tenantId: string,
    campusId: string,
    student: any,
    details: { type: 'ABSENCE' | 'TRUANCY_WARNING' | 'LOW_ATTENDANCE'; date: string; remarks?: string; details?: string },
  ) {
    try {
      // Find parent contact
      let parentContact: { phone?: string; email?: string } | null = null;
      if (student.parentId) {
        const parent = this.prisma.memoryStore.parents.get(student.parentId);
        if (parent) {
          parentContact = { phone: parent.phone, email: parent.email };
        }
      }

      if (!parentContact) {
        const studentParent = Array.from(this.prisma.memoryStore.studentParents?.values() || []).find(
          (sp: any) => sp.studentId === student.id,
        ) as any;
        if (studentParent?.parentId) {
          const parent = this.prisma.memoryStore.parents.get(studentParent.parentId);
          if (parent) parentContact = { phone: parent.phone, email: parent.email };
        }
      }

      const recipient = parentContact?.phone || parentContact?.email || student.phone || student.email || 'parent@example.com';
      const channel = parentContact?.phone ? 'sms' : 'email';
      const subject = details.type === 'ABSENCE'
        ? `Absence Alert: ${student.firstName} ${student.lastName}`
        : `Truancy Warning: ${student.firstName} ${student.lastName}`;
      const body = details.type === 'ABSENCE'
        ? `Dear Parent, please be notified that ${student.firstName} ${student.lastName} was marked ABSENT on ${details.date}. Remarks: ${details.remarks || 'None'}.`
        : `Dear Parent, urgent attendance alert: ${student.firstName} ${student.lastName} has triggered a truancy flag on ${details.date}. ${details.details || ''}`;

      await this.bullmqService.dispatch(
        QUEUES.NOTIFICATIONS,
        channel === 'sms' ? JOB_TYPES.SEND_SMS : JOB_TYPES.SEND_EMAIL,
        {
          tenantId,
          campusId,
          userId: 'system_attendance',
          data: {
            channel,
            tenantId,
            recipient,
            subject,
            body,
            metadata: { studentId: student.id, date: details.date, type: details.type },
          },
        },
      );
    } catch (err: any) {
      // Fault isolation: notification errors must NEVER break attendance recording
      this.logger.warn(`Non-blocking notification dispatch failure for student ${student.id}: ${err.message}`);
    }
  }
}
