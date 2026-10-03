import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParentsService } from '../src/modules/parents/parents.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

describe('Parent Portal & Multi-Child Resolution', () => {
  let service: ParentsService;
  let prisma: PrismaService;

  const tenantId = 'tenant_parent_01';
  const userId = 'usr_parent_01';

  beforeEach(() => {
    prisma = {
      isDbConnected: true,
      memoryStore: {
        parents: new Map(),
      },
      user: {
        findUnique: vi.fn(),
      },
      parent: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      studentParent: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        createMany: vi.fn(),
      },
      student: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: tenantId,
          name: 'Apex Academy Lagos',
          currency: 'NGN',
          features: {
            paymentConfig: {
              defaultProvider: 'PAYSTACK',
              bankName: 'Access Bank',
              accountNumber: '0123456789',
              accountName: 'Apex Academy Tuition Account',
              paymentInstructions: 'Include student admission number in narration',
            },
          },
        }),
      },
    } as any;

    service = new ParentsService(prisma);
  });

  it('should resolve multiple wards for parent portal and compute aggregated attendance, fees, and school payment details', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: userId,
      email: 'john.doe.parent@example.com',
      phone: '+2348011223344',
      firstName: 'John',
      lastName: 'Doe',
    });

    const mockParentRecord = {
      id: 'par_001',
      tenantId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe.parent@example.com',
      phone: '+2348011223344',
      relationship: 'Father',
      students: [
        {
          id: 'sp_1',
          studentId: 'std_child_1',
          isPrimaryContact: true,
          student: {
            id: 'std_child_1',
            admissionNumber: 'SCH/2026/001',
            firstName: 'Alice',
            lastName: 'Doe',
            campus: { name: 'Main Campus' },
            enrollments: [{ class: { name: 'JSS 1 A' } }],
            attendance: [
              { status: 'PRESENT' },
              { status: 'PRESENT' },
              { status: 'ABSENT' },
              { status: 'PRESENT' },
            ],
            invoices: [
              { id: 'inv_1', invoiceNumber: 'INV-001', totalAmount: 150000, paidAmount: 100000, balanceAmount: 50000, status: 'PARTIAL' },
            ],
          },
        },
        {
          id: 'sp_2',
          studentId: 'std_child_2',
          isPrimaryContact: true,
          student: {
            id: 'std_child_2',
            admissionNumber: 'SCH/2026/002',
            firstName: 'Bob',
            lastName: 'Doe',
            campus: { name: 'Main Campus' },
            enrollments: [{ class: { name: 'Primary 5' } }],
            attendance: [
              { status: 'PRESENT' },
              { status: 'PRESENT' },
            ],
            invoices: [
              { id: 'inv_2', invoiceNumber: 'INV-002', totalAmount: 120000, paidAmount: 120000, balanceAmount: 0, status: 'PAID' },
            ],
          },
        },
      ],
    };

    (prisma.parent.findFirst as any).mockResolvedValue(mockParentRecord);

    const profile = await service.getPortalProfile(tenantId, userId);

    expect(profile).toBeDefined();
    expect(profile.parent.fullName).toBe('John Doe');
    expect(profile.wards.length).toBe(2);

    // Alice verification
    const alice = profile.wards.find((w: any) => w.studentId === 'std_child_1');
    expect(alice).toBeDefined();
    expect(alice.fullName).toBe('Alice Doe');
    expect(alice.className).toBe('JSS 1 A');
    expect(alice.attendance.totalDays).toBe(4);
    expect(alice.attendance.presentDays).toBe(3);
    expect(alice.attendance.percentage).toBe(75);
    expect(alice.fees.balanceDue).toBe(50000);
    expect(alice.fees.isSettled).toBe(false);

    // Bob verification
    const bob = profile.wards.find((w: any) => w.studentId === 'std_child_2');
    expect(bob).toBeDefined();
    expect(bob.fullName).toBe('Bob Doe');
    expect(bob.className).toBe('Primary 5');
    expect(bob.attendance.percentage).toBe(100);
    expect(bob.fees.balanceDue).toBe(0);
    expect(bob.fees.isSettled).toBe(true);

    // Summary verification
    expect(profile.summary.totalWards).toBe(2);
    expect(profile.summary.totalOutstanding).toBe(50000);
    expect(profile.summary.isAllSettled).toBe(false);

    // School payment details verification
    expect(profile.school).toBeDefined();
    expect(profile.school.name).toBe('Apex Academy Lagos');
    expect(profile.school.currency).toBe('NGN');
    expect(profile.school.bankDetails.bankName).toBe('Access Bank');
    expect(profile.school.bankDetails.accountNumber).toBe('0123456789');
    expect(profile.school.bankDetails.accountName).toBe('Apex Academy Tuition Account');
  });

  it('should throw NotFoundException if user is not found', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    await expect(service.getPortalProfile(tenantId, 'non_existent_user')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if parent record does not exist for the user in the specified tenant', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: userId,
      email: 'orphan.user@example.com',
    });
    (prisma.parent.findFirst as any).mockResolvedValue(null);

    await expect(service.getPortalProfile(tenantId, userId)).rejects.toThrow(NotFoundException);
  });

  it('should provision a new User record with hashed password and PARENT role when creating a parent', async () => {
    prisma.role = {
      findFirst: vi.fn().mockResolvedValue({ id: 'role_parent_123', name: 'PARENT' }),
      create: vi.fn(),
    } as any;
    prisma.user = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'usr_new_parent_123',
        ...args.data,
      })),
    } as any;
    prisma.userRole = {
      upsert: vi.fn().mockResolvedValue({ id: 'ur_123' }),
    } as any;
    (prisma.parent.create as any).mockImplementation((args) => Promise.resolve({
      id: args.data.id,
      ...args.data,
    }));
    (prisma.parent.findFirst as any).mockImplementation((args) => Promise.resolve({
      id: 'par_001',
      userId: 'usr_new_parent_123',
      tenantId,
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+2348099887766',
      students: [],
    }));

    const result = await service.create(tenantId, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+2348099887766',
      password: 'SecureCustomPassword456!',
    });

    expect(result).toBeDefined();
    expect(prisma.user.create).toHaveBeenCalled();
    const createCallArgs = (prisma.user.create as any).mock.calls[0][0];
    expect(createCallArgs.data.email).toBe('jane.doe@example.com');
    expect(createCallArgs.data.passwordHash).toBeDefined();
    expect(createCallArgs.data.passwordHash).not.toBe('SecureCustomPassword456!');
    expect(createCallArgs.data.passwordHash.startsWith('$2a$') || createCallArgs.data.passwordHash.startsWith('$2b$')).toBe(true);
  });

  it('should link existing User record when email matches and add PARENT role if not present', async () => {
    prisma.role = {
      findFirst: vi.fn().mockResolvedValue({ id: 'role_parent_123', name: 'PARENT' }),
    } as any;
    prisma.user = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'usr_existing_123',
        tenantId,
        email: 'existing.parent@example.com',
      }),
      create: vi.fn(),
    } as any;
    prisma.userRole = {
      upsert: vi.fn().mockResolvedValue({ id: 'ur_123' }),
    } as any;

    const linkedUserId = await service.provisionOrLinkParentUser(tenantId, {
      firstName: 'Existing',
      lastName: 'Parent',
      email: 'existing.parent@example.com',
    });

    expect(linkedUserId).toBe('usr_existing_123');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_roleId: {
            userId: 'usr_existing_123',
            roleId: 'role_parent_123',
          },
        },
      }),
    );
  });

  it('should validate parent-ward ownership and throw ForbiddenException if student is not linked', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: userId,
      email: 'john.doe@example.com',
    });
    (prisma.parent.findFirst as any).mockResolvedValue({
      id: 'par_001',
      tenantId,
      userId,
    });
    (prisma.studentParent.findFirst as any).mockResolvedValue(null); // Not linked

    await expect(
      service.validateParentWardAccess(tenantId, userId, 'std_unlinked_child'),
    ).rejects.toThrow();
  });

  it('should retrieve ward attendance history and statistics accurately', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({
      id: 'std_child_1',
      firstName: 'Alice',
      lastName: 'Doe',
      admissionNumber: 'SCH/2026/001',
    });
    (prisma.attendance = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'att_1', date: new Date('2026-10-01'), status: 'PRESENT', sessionType: 'DAILY' },
        { id: 'att_2', date: new Date('2026-09-30'), status: 'LATE', sessionType: 'DAILY' },
        { id: 'att_3', date: new Date('2026-09-29'), status: 'ABSENT', sessionType: 'DAILY' },
      ]),
    } as any);

    const att = await service.getWardAttendance(tenantId, userId, 'std_child_1');
    expect(att.student.fullName).toBe('Alice Doe');
    expect(att.stats.totalDays).toBe(3);
    expect(att.stats.presentDays).toBe(2);
    expect(att.stats.absentDays).toBe(1);
    expect(att.stats.percentage).toBe(67);
    expect(att.records.length).toBe(3);
  });

  it('should retrieve ward published exam results and exclude unlinked assessments', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({
      id: 'std_child_1',
      firstName: 'Alice',
      lastName: 'Doe',
      admissionNumber: 'SCH/2026/001',
    });
    (prisma.examination = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'exam_term1', name: 'First Term Examination 2026', isPublished: true },
      ]),
    } as any);
    (prisma.result = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'res_1',
          examinationId: 'exam_term1',
          subjectId: 'sub_math',
          marksObtained: 85,
          maxMarks: 100,
          grade: 'A',
          remarks: 'Excellent',
          subject: { name: 'Mathematics' },
          examination: { name: 'First Term Examination 2026' },
        },
      ]),
    } as any);

    const res = await service.getWardResults(tenantId, userId, 'std_child_1');
    expect(res.student.fullName).toBe('Alice Doe');
    expect(res.publishedExaminations.length).toBe(1);
    expect(res.results.length).toBe(1);
    expect(res.results[0].subjectName).toBe('Mathematics');
    expect(res.results[0].marksObtained).toBe(85);
    expect(res.results[0].grade).toBe('A');
  });

  it('should retrieve ward class timetable schedule', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({
      id: 'std_child_1',
      firstName: 'Alice',
      lastName: 'Doe',
      currentClassId: 'cls_jss1',
      enrollments: [{ class: { id: 'cls_jss1', name: 'JSS 1 A' } }],
    });
    (prisma.timetableEntry = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'tt_1',
          dayOfWeek: 1,
          periodNumber: 1,
          startTime: '08:00',
          endTime: '08:45',
          subject: { name: 'English Language' },
          teacher: { firstName: 'Sarah', lastName: 'Connor' },
          room: { name: 'Room 101' },
        },
      ]),
    } as any);

    const tt = await service.getWardTimetable(tenantId, userId, 'std_child_1');
    expect(tt.student.fullName).toBe('Alice Doe');
    expect(tt.schedule.length).toBe(1);
    expect(tt.schedule[0].subjectName).toBe('English Language');
    expect(tt.schedule[0].teacherName).toBe('Sarah Connor');
  });

  it('should retrieve ward homework assignments and submissions', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({
      id: 'std_child_1',
      firstName: 'Alice',
      lastName: 'Doe',
      currentClassId: 'cls_jss1',
    });
    prisma.memoryStore.homework = new Map([
      [
        'hw_1',
        {
          id: 'hw_1',
          tenantId,
          classId: 'cls_jss1',
          subjectId: 'sub_math',
          title: 'Algebra Exercise 4',
          description: 'Solve problems 1 through 10',
          dueDate: new Date('2026-10-10'),
          maxMarks: 20,
          status: 'PUBLISHED',
        },
      ],
    ]);
    prisma.memoryStore.subjects = new Map([
      ['sub_math', { id: 'sub_math', name: 'Mathematics' }],
    ]);
    prisma.memoryStore.homeworkSubmissions = new Map();

    const hw = await service.getWardHomework(tenantId, userId, 'std_child_1');
    expect(hw.student.fullName).toBe('Alice Doe');
    expect(hw.assignments.length).toBe(1);
    expect(hw.assignments[0].title).toBe('Algebra Exercise 4');
    expect(hw.assignments[0].subjectName).toBe('Mathematics');
  });

  it('should retrieve ward medical and allergy summary', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({
      id: 'std_child_1',
      firstName: 'Alice',
      lastName: 'Doe',
      bloodGroup: 'O+',
      genotype: 'AA',
      allergies: 'Peanuts',
      emergencyContactName: 'John Doe',
      emergencyContactPhone: '+2348011223344',
    });

    const med = await service.getWardMedical(tenantId, userId, 'std_child_1');
    expect(med.student.fullName).toBe('Alice Doe');
    expect(med.medicalProfile.bloodGroup).toBe('O+');
    expect(med.medicalProfile.genotype).toBe('AA');
    expect(med.medicalProfile.allergies).toContain('Peanuts');
  });

  it('should resolve ward assigned teachers and class teachers', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({
      id: 'std_child_1',
      firstName: 'Alice',
      lastName: 'Doe',
      classId: 'cls_jss1',
      class: { name: 'JSS 1 A' },
    });

    (prisma as any).class = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cls_jss1',
        classTeacher: {
          id: 'tch_01',
          userId: 'usr_tch_01',
          firstName: 'Mrs. Mary',
          lastName: 'Okoro',
          email: 'mary.okoro@school.edu',
          phone: '+2348033333333',
        },
      }),
    };

    (prisma as any).classSubject = {
      findMany: vi.fn().mockResolvedValue([
        {
          subject: { name: 'Mathematics' },
          teacher: {
            id: 'tch_02',
            userId: 'usr_tch_02',
            firstName: 'Mr. Emmanuel',
            lastName: 'Ade',
            email: 'emmanuel.ade@school.edu',
            phone: '+2348044444444',
          },
        },
      ]),
    };

    const res = await service.getWardTeachers(tenantId, userId, 'std_child_1');
    expect(res.student.fullName).toBe('Alice Doe');
    expect(res.teachers.length).toBe(2);
    expect(res.teachers[0].name).toBe('Mrs. Mary Okoro');
    expect(res.teachers[0].role).toBe('Class Teacher');
    expect(res.teachers[1].name).toBe('Mr. Emmanuel Ade');
    expect(res.teachers[1].subject).toBe('Mathematics');
  });

  it('should support creating two-way communication threads and sending replies', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });

    (prisma as any).communicationThread = {
      create: vi.fn().mockResolvedValue({
        id: 'th_01',
        tenantId,
        subject: 'Mathematics homework clarification',
        createdById: userId,
        participantIds: [userId, 'usr_tch_02'],
        messages: [
          {
            id: 'msg_01',
            senderId: userId,
            senderType: 'PARENT',
            content: 'Hello, could you explain question 5?',
            createdAt: new Date(),
          },
        ],
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'th_01',
          tenantId,
          subject: 'Mathematics homework clarification',
          createdById: userId,
          participantIds: [userId, 'usr_tch_02'],
          lastMessageAt: new Date(),
          createdAt: new Date(),
          messages: [
            {
              id: 'msg_01',
              senderId: userId,
              senderType: 'PARENT',
              content: 'Hello, could you explain question 5?',
              createdAt: new Date(),
            },
          ],
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'th_01',
        tenantId,
        subject: 'Mathematics homework clarification',
        createdById: userId,
        participantIds: [userId, 'usr_tch_02'],
      }),
      update: vi.fn().mockResolvedValue({ id: 'th_01' }),
    };

    (prisma as any).communicationMessage = {
      create: vi.fn().mockResolvedValue({
        id: 'msg_02',
        threadId: 'th_01',
        senderId: userId,
        senderType: 'PARENT',
        content: 'Thank you for following up.',
        createdAt: new Date(),
      }),
    };

    (prisma as any).inAppInboxItem = {
      create: vi.fn().mockResolvedValue({ id: 'inb_01' }),
    };

    // 1. Create thread
    const thread = await service.createParentThread(tenantId, userId, {
      recipientUserId: 'usr_tch_02',
      studentId: 'std_child_1',
      subject: 'Mathematics homework clarification',
      message: 'Hello, could you explain question 5?',
    });
    expect(thread).toBeDefined();
    expect(thread.subject).toBe('Mathematics homework clarification');

    // 2. Query threads
    const threads = await service.getParentThreads(tenantId, userId);
    expect(threads.length).toBe(1);
    expect(threads[0].messages[0].isOwn).toBe(true);

    // 3. Send reply
    const reply = await service.sendThreadReply(tenantId, userId, 'th_01', {
      content: 'Thank you for following up.',
    });
    expect(reply).toBeDefined();
    expect(reply.content).toBe('Thank you for following up.');
  });

  it('should route parent threads accurately using 3-way recipient modes (Class Teacher, Admin, Both)', async () => {
    (prisma as any).communicationThread = {
      create: vi.fn().mockImplementation(({ data }) => ({
        id: data.id,
        tenantId: data.tenantId,
        subject: data.subject,
        createdById: data.createdById,
        participantIds: data.participantIds,
        messages: [{ content: data.messages.create.content, senderId: data.messages.create.senderId }],
      })),
    };

    (prisma as any).inAppInboxItem = {
      create: vi.fn().mockResolvedValue({ id: 'inb_01' }),
    };

    (prisma as any).user = {
      ...prisma.user,
      findMany: vi.fn().mockResolvedValue([
        { id: 'usr_admin_01', tenantId, email: 'admin@school.com' },
      ]),
    };

    (prisma as any).student = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'std_child_1',
        class: {
          classTeacher: { id: 'tch_01', userId: 'usr_tch_01' },
        },
      }),
    };

    // Case 1: CLASS_TEACHER mode
    const teacherThread = await service.createParentThread(tenantId, userId, {
      recipientType: 'CLASS_TEACHER',
      studentId: 'std_child_1',
      subject: 'Inquiry on Science project',
      message: 'Hello teacher, can you explain the requirements?',
    });
    expect(teacherThread.participantIds).toContain(userId);
    expect(teacherThread.participantIds).toContain('usr_tch_01');

    // Case 2: ADMIN mode
    const adminThread = await service.createParentThread(tenantId, userId, {
      recipientType: 'ADMIN',
      studentId: 'std_child_1',
      subject: 'Tuition invoice query',
      message: 'Hello bursary, please check payment receipt.',
    });
    expect(adminThread.participantIds).toContain(userId);
    expect(adminThread.participantIds).toContain('usr_admin_01');

    // Case 3: BOTH mode
    const jointThread = await service.createParentThread(tenantId, userId, {
      recipientType: 'BOTH',
      studentId: 'std_child_1',
      subject: 'Medical leave notification',
      message: 'Student will be absent next week for surgery.',
    });
    expect(jointThread.participantIds).toContain(userId);
    expect(jointThread.participantIds).toContain('usr_tch_01');
    expect(jointThread.participantIds).toContain('usr_admin_01');
  });

  it('should retrieve ward live transport telemetry and ETA', async () => {
    const mockTransportService = {
      getStudentLiveTransport: vi.fn().mockResolvedValue({
        student: { id: 'std_child_1', firstName: 'Alice', lastName: 'Doe' },
        status: 'ACTIVE',
        liveTrackingEnabled: true,
        trip: {
          id: 'trp_01',
          status: 'IN_PROGRESS',
          route: { routeName: 'Victoria Island Express', vehicleNumber: 'BUS-001', driverName: 'Mr. David' },
        },
        childStatus: { status: 'BOARDED', stopName: 'Admiralty Way' },
        liveLocation: { latitude: 6.45, longitude: 3.42, speed: 38 },
        eta: { distanceKm: 2.5, estimatedMinutesAway: 6, isApproachingStop: false },
      }),
    };

    const serviceWithTransport = new ParentsService(
      prisma,
      undefined,
      undefined,
      mockTransportService as any,
    );

    (prisma.user.findUnique as any).mockResolvedValue({ id: userId });
    (prisma.parent.findFirst as any).mockResolvedValue({ id: 'par_001', tenantId, userId });
    (prisma.studentParent.findFirst as any).mockResolvedValue({ id: 'sp_1', parentId: 'par_001', studentId: 'std_child_1' });
    (prisma.student.findFirst as any).mockResolvedValue({ id: 'std_child_1', firstName: 'Alice', lastName: 'Doe' });

    const transport = await serviceWithTransport.getWardTransport(tenantId, userId, 'std_child_1');
    expect(transport.status).toBe('ACTIVE');
    expect(transport.liveTrackingEnabled).toBe(true);
    expect(transport.trip.route.routeName).toBe('Victoria Island Express');
    expect(transport.childStatus.status).toBe('BOARDED');
    expect(transport.eta.estimatedMinutesAway).toBe(6);
  });

  it('should retrieve portal announcements with normalized parent audience', async () => {
    (prisma as any).notification = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'notif_01',
          tenantId,
          title: 'Inter-House Sports Day',
          message: 'All parents are cordially invited to our annual sports day next Friday.',
          channel: 'Portal Noticeboard',
          status: 'SENT',
          createdAt: new Date('2026-10-15T09:00:00Z'),
        },
      ]),
    };

    const announcements = await service.getPortalAnnouncements(tenantId, userId);
    expect(announcements.length).toBe(1);
    expect(announcements[0].title).toBe('Inter-House Sports Day');
    expect(announcements[0].status).toBe('Delivered');
  });

  it('should trigger InAppInboxItem to parent on clinic intake and fee invoice generation', async () => {
    const { ClinicService } = await import('../src/modules/medical/services/clinic.service.js');
    const { FeesService } = await import('../src/modules/fees/fees.service.js');

    const inAppCreateSpy = vi.fn().mockResolvedValue({ id: 'inb_test_01' });

    const customPrisma: any = {
      isDbConnected: true,
      memoryStore: {
        students: new Map([['std_01', { id: 'std_01', tenantId, firstName: 'Alice', lastName: 'Doe', admissionNumber: 'SCH/01' }]]),
        parents: new Map([['par_01', { id: 'par_01', tenantId, userId: 'usr_parent_01' }]]),
        studentParents: new Map([['sp_01', { id: 'sp_01', studentId: 'std_01', parentId: 'par_01' }]]),
        feeStructures: new Map([['fee_01', { id: 'fee_01', tenantId, name: 'Tuition Fee', amount: 150000, currency: 'NGN' }]]),
        invoices: new Map(),
        inboxItems: new Map(),
      },
      studentParent: {
        findMany: vi.fn().mockResolvedValue([
          { parent: { userId: 'usr_parent_01', user: { id: 'usr_parent_01' } } },
        ]),
      },
      student: {
        findFirst: vi.fn().mockResolvedValue({ id: 'std_01', tenantId, firstName: 'Alice', lastName: 'Doe' }),
      },
      feeStructure: {
        findFirst: vi.fn().mockResolvedValue({ id: 'fee_01', tenantId, name: 'Tuition Fee', amount: 150000, currency: 'NGN' }),
      },
      invoice: {
        create: vi.fn().mockImplementation(({ data }) => ({ ...data, id: data.id || 'inv_test_01' })),
      },
      inAppInboxItem: {
        create: inAppCreateSpy,
      },
    };

    // 1. Clinic Visit Trigger
    const clinicService = new ClinicService(customPrisma);
    await clinicService.recordClinicVisit(tenantId, {
      patientId: 'std_01',
      student: 'Alice Doe',
      studentId: 'SCH/01',
      chiefComplaint: 'Mild headache',
      diagnosis: 'Administered paracetamol',
      parentNotified: true,
    } as any);

    expect(inAppCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'usr_parent_01',
          category: 'HEALTH_UPDATE',
          title: expect.stringContaining('School Clinic Visit: Alice Doe'),
        }),
      }),
    );

    // 2. Fee Invoice Generation Trigger
    const feesService = new FeesService(customPrisma);
    await feesService.generateInvoice(tenantId, {
      studentId: 'std_01',
      feeStructureId: 'fee_01',
      notes: 'Term 1 Tuition',
    });

    expect(inAppCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'usr_parent_01',
          category: 'FEE_REMINDER',
          title: expect.stringContaining('New School Fee Invoice'),
        }),
      }),
    );
  });
});


