import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { StaffAttendanceGeoService } from '../src/modules/staff-attendance/services/staff-attendance-geo.service.js';
import { StaffAttendanceDeviceService } from '../src/modules/staff-attendance/services/staff-attendance-device.service.js';
import { StaffAttendanceConfigService } from '../src/modules/staff-attendance/services/staff-attendance-config.service.js';
import { StaffAttendanceCoreService } from '../src/modules/staff-attendance/services/staff-attendance-core.service.js';
import { StaffAttendanceReportService } from '../src/modules/staff-attendance/services/staff-attendance-report.service.js';
import {
  StaffAttendanceDeviceType,
  StaffAttendanceStatus,
  StaffClockInStatus,
  StaffCorrectionStatus,
} from '@prisma/client';

describe('Staff Clocking & Attendance Module — End-to-End Integration Suite', () => {
  let prisma: PrismaService;
  let geoService: StaffAttendanceGeoService;
  let deviceService: StaffAttendanceDeviceService;
  let configService: StaffAttendanceConfigService;
  let coreService: StaffAttendanceCoreService;
  let reportService: StaffAttendanceReportService;

  const testTenantId = `tenant_staff_att_${Date.now()}`;
  const testTenantId2 = `tenant_staff_att_iso_${Date.now()}`;
  let testCampusId: string;
  let staffA: any;
  let staffB: any;
  let testLocation: any;
  let adminUser: any;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    geoService = new StaffAttendanceGeoService(prisma);
    deviceService = new StaffAttendanceDeviceService(prisma);
    configService = new StaffAttendanceConfigService(prisma);
    coreService = new StaffAttendanceCoreService(prisma, geoService, deviceService, configService);
    reportService = new StaffAttendanceReportService(prisma);

    // Setup Test Tenant A
    await prisma.tenant.create({
      data: {
        id: testTenantId,
        name: 'Staff Attendance Test Academy',
        slug: `test-staff-${Date.now()}`,
        status: 'ACTIVE',
        timezone: 'UTC',
      },
    });

    // Setup Test Tenant B for Isolation Check
    await prisma.tenant.create({
      data: {
        id: testTenantId2,
        name: 'Isolation Test Academy',
        slug: `test-iso-${Date.now()}`,
        status: 'ACTIVE',
        timezone: 'UTC',
      },
    });

    // Campus
    const campus = await prisma.campus.create({
      data: {
        tenantId: testTenantId,
        name: 'Main Campus',
        code: `CMP_${Date.now()}`,
      },
    });
    testCampusId = campus.id;

    // Admin User
    adminUser = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        email: `admin_staff_${Date.now()}@school.edu`,
        passwordHash: 'hash_secret',
        firstName: 'Principal',
        lastName: 'Admin',
      },
    });

    // Staff A
    staffA = await prisma.staff.create({
      data: {
        tenantId: testTenantId,
        campusId: testCampusId,
        employeeNumber: `STF-001-${Date.now()}`,
        firstName: 'John',
        lastName: 'Doe',
        email: `john.doe.${Date.now()}@school.edu`,
        employmentStatus: 'ACTIVE',
        isActive: true,
      },
    });

    // Staff B
    staffB = await prisma.staff.create({
      data: {
        tenantId: testTenantId,
        campusId: testCampusId,
        employeeNumber: `STF-002-${Date.now()}`,
        firstName: 'Jane',
        lastName: 'Smith',
        email: `jane.smith.${Date.now()}@school.edu`,
        employmentStatus: 'ACTIVE',
        isActive: true,
      },
    });

    // Geofenced Campus Location (e.g. Lagos City Center: 6.5244, 3.3792, Radius: 100m)
    testLocation = await prisma.staffAttendanceLocation.create({
      data: {
        tenantId: testTenantId,
        campusId: testCampusId,
        name: 'Main Administrative Gate',
        latitude: 6.5244,
        longitude: 3.3792,
        radiusMeters: 100,
        isActive: true,
      },
    });

    // Set Tenant Config
    await configService.updateConfig(testTenantId, {
      expectedClockInTime: '08:00',
      gracePeriodMinutes: 15,
      lateThresholdTime: '08:30',
      halfDayThresholdTime: '12:00',
      expectedClockOutTime: '16:00',
      requireGps: true,
      maxAllowedGpsAccuracyMeters: 100,
      personalDeviceLockHours: 12,
      allowKioskMode: true,
      allowMobileSelfClock: true,
    });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await prisma.staffAttendanceRecord.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.staffAttendanceLocation.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.staffAttendanceDevice.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.staffAttendanceConfig.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.staff.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.campus.deleteMany({ where: { tenantId: testTenantId } });
      await prisma.tenant.deleteMany({ where: { id: { in: [testTenantId, testTenantId2] } } });
    } catch {}
    await prisma.onModuleDestroy();
  });

  describe('1. Mathematical Geofencing Engine', () => {
    it('should calculate Haversine distance accurately in meters', () => {
      // Distance between (6.5244, 3.3792) and (6.5245, 3.3793) ~ 15.6m
      const dist = geoService.calculateDistanceMeters(6.5244, 3.3792, 6.5245, 3.3793);
      expect(dist).toBeGreaterThan(10);
      expect(dist).toBeLessThan(25);
    });

    it('should approve location when coordinates fall inside configured geofence radius', async () => {
      // 20 meters away from main gate
      const result = await geoService.verifyGeofence(testTenantId, 6.52445, 3.37925, 15, testCampusId);
      expect(result.isWithinGeofence).toBe(true);
      expect(result.matchedLocationId).toBe(testLocation.id);
      expect(result.distanceMeters).toBeLessThanOrEqual(100);
    });

    it('should reject location when coordinates fall outside configured geofence radius', async () => {
      // 5km away from main gate
      const result = await geoService.verifyGeofence(testTenantId, 6.6000, 3.4000, 15, testCampusId);
      expect(result.isWithinGeofence).toBe(false);
      expect(result.reason).toContain('away');
    });

    it('should reject clocking when GPS accuracy is too low (spoofing / bad signal)', async () => {
      // Accuracy of 250m is > maxAllowedGpsAccuracyMeters of 100m
      const result = await geoService.verifyGeofence(testTenantId, 6.5244, 3.3792, 250, testCampusId);
      expect(result.isWithinGeofence).toBe(false);
      expect(result.accuracyAcceptable).toBe(false);
      expect(result.reason).toContain('accuracy is too low');
    });
  });

  describe('2. Anti-Buddy-Punching & Device Lock Engine', () => {
    const personalFingerprint = `phone_fp_alpha_${Date.now()}`;

    it('should allow first staff member to clock on personal device and lock the device', async () => {
      const devRes = await deviceService.validateDeviceForClocking(
        testTenantId,
        staffA.id,
        personalFingerprint,
      );

      expect(devRes.isValid).toBe(true);
      expect(devRes.device.lockedStaffId).toBe(staffA.id);
      expect(devRes.device.lockedUntil).toBeDefined();
    });

    it('should reject a second staff member attempting to clock on the same personal mobile device (Anti-Proxy Lock)', async () => {
      await expect(
        deviceService.validateDeviceForClocking(
          testTenantId,
          staffB.id, // Different staff member!
          personalFingerprint,
        ),
      ).rejects.toThrow(/Device Lockout/);
    });

    it('should allow multiple staff members to clock on a registered KIOSK terminal without proxy lock', async () => {
      // Register Kiosk
      const kiosk = await deviceService.registerDevice(testTenantId, {
        deviceName: 'Gate Wall Tablet',
        deviceFingerprint: `kiosk_hw_${Date.now()}`,
        deviceType: StaffAttendanceDeviceType.KIOSK,
      });

      expect(kiosk.rawKioskToken).toBeDefined();

      // Clock Staff A on Kiosk
      const valA = await deviceService.validateDeviceForClocking(
        testTenantId,
        staffA.id,
        undefined,
        kiosk.rawKioskToken,
      );
      expect(valA.isValid).toBe(true);
      expect(valA.isKiosk).toBe(true);

      // Clock Staff B on same Kiosk -> Must succeed!
      const valB = await deviceService.validateDeviceForClocking(
        testTenantId,
        staffB.id,
        undefined,
        kiosk.rawKioskToken,
      );
      expect(valB.isValid).toBe(true);
      expect(valB.isKiosk).toBe(true);
    });

    it('should allow an administrator to release the personal device lock', async () => {
      const device = await prisma.staffAttendanceDevice.findFirst({
        where: { tenantId: testTenantId, deviceFingerprint: personalFingerprint },
      });

      expect(device).toBeDefined();
      await reportService.unlockDevice(testTenantId, device!.id);

      // Now staffB can clock on it since lock was released
      const unlockedVal = await deviceService.validateDeviceForClocking(
        testTenantId,
        staffB.id,
        personalFingerprint,
      );
      expect(unlockedVal.isValid).toBe(true);
    });
  });

  describe('3. Core Clock-In & Clock-Out Lifecycle', () => {
    it('should successfully record Clock-In for staff member with geofence validation', async () => {
      const clockInRes = await coreService.clockIn(testTenantId, {
        staffIdentifier: staffA.employeeNumber,
        latitude: 6.52442,
        longitude: 3.37921,
        accuracy: 10,
        deviceFingerprint: `device_staff_a_${Date.now()}`,
      });

      expect(clockInRes.record).toBeDefined();
      expect(clockInRes.status).toBe(StaffAttendanceStatus.PRESENT);
      expect(clockInRes.record.clockInTime).toBeDefined();
      expect(clockInRes.record.clockInLocationId).toBe(testLocation.id);
    });

    it('should prevent duplicate clock-in on the same day', async () => {
      await expect(
        coreService.clockIn(testTenantId, {
          staffIdentifier: staffA.employeeNumber,
          latitude: 6.52442,
          longitude: 3.37921,
          accuracy: 10,
          deviceFingerprint: `device_staff_a_${Date.now()}`,
        }),
      ).rejects.toThrow(/already clocked in today/);
    });

    it('should successfully record Clock-Out for staff member', async () => {
      const clockOutRes = await coreService.clockOut(testTenantId, {
        staffIdentifier: staffA.employeeNumber,
        latitude: 6.52442,
        longitude: 3.37921,
        accuracy: 10,
        notes: 'End of academic duty',
      });

      expect(clockOutRes.record).toBeDefined();
      expect(clockOutRes.record.clockOutTime).toBeDefined();
      expect(clockOutRes.record.clockOutStatus).toBeDefined();
    });
  });

  describe('4. Administrative Manual Adjustments & Correction Reviews', () => {
    it('should support manual roll-call entry by administrator', async () => {
      const manualRes = await coreService.manualEntry(testTenantId, {
        staffId: staffB.id,
        date: '2026-10-01',
        status: StaffAttendanceStatus.PRESENT,
        clockInTime: '07:50',
        clockOutTime: '16:05',
        notes: 'Recorded manually from gate physical ledger',
      });

      expect(manualRes.isManualEntry).toBe(true);
      expect(manualRes.status).toBe(StaffAttendanceStatus.PRESENT);
      expect(manualRes.staffId).toBe(staffB.id);
    });

    it('should allow staff to submit correction dispute request and admin to approve it', async () => {
      // Find today's record for Staff A
      const today = new Date().toISOString().split('T')[0];
      const record = await prisma.staffAttendanceRecord.findUnique({
        where: {
          tenantId_staffId_date: {
            tenantId: testTenantId,
            staffId: staffA.id,
            date: today,
          },
        },
      });

      expect(record).toBeDefined();

      // Submit Correction
      const correction = await coreService.requestCorrection(testTenantId, adminUser.id, {
        recordId: record!.id,
        reason: 'Clocked in at 07:45 AM during staff assembly, terminal had temporary network delay.',
        correctedStatus: StaffAttendanceStatus.PRESENT,
      });

      expect(correction.status).toBe(StaffCorrectionStatus.PENDING);

      // Admin Review (Approve)
      const reviewed = await coreService.reviewCorrection(
        testTenantId,
        adminUser.id,
        correction.id,
        {
          status: StaffCorrectionStatus.APPROVED,
          reviewNotes: 'Verified with assembly supervisor. Approved.',
        },
      );

      expect(reviewed.status).toBe(StaffCorrectionStatus.APPROVED);

      // Verify master record was updated
      const updatedRecord = await prisma.staffAttendanceRecord.findUnique({
        where: { id: record!.id },
      });
      expect(updatedRecord!.isManualEntry).toBe(true);
      expect(updatedRecord!.notes).toContain('[Correction Approved by Admin]');
    });
  });

  describe('5. Real-Time Daily Summary & Multi-Tenant Isolation', () => {
    it('should compute real-time daily summary KPIs accurately from PostgreSQL', async () => {
      const summary = await reportService.getDailySummary(testTenantId);
      expect(summary.totalStaff).toBe(2);
      expect(summary.totalRecorded).toBeGreaterThanOrEqual(1);
      expect(summary.attendanceRate).toBeGreaterThan(0);
      expect(Array.isArray(summary.records)).toBe(true);
    });

    it('should strictly isolate data between tenants', async () => {
      // Query summary for Tenant 2 (which has no staff records)
      const summary2 = await reportService.getDailySummary(testTenantId2);
      expect(summary2.totalStaff).toBe(0);
      expect(summary2.totalRecorded).toBe(0);
      expect(summary2.records.length).toBe(0);

      // Query records for Tenant 2
      const records2 = await reportService.getRecords(testTenantId2, {});
      expect(records2.data.length).toBe(0);
      expect(records2.meta.total).toBe(0);
    });
  });
});
