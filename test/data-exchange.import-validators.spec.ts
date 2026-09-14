import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { CsvParserService } from '../src/modules/data-exchange/services/csv-parser.service.js';
import { DataImportService } from '../src/modules/data-exchange/services/data-import.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';

describe('Bulk CSV Data Import Validators (Students & Parents)', () => {
  let prisma: PrismaService;
  let csvParser: CsvParserService;
  let auditService: AuditService;
  let importService: DataImportService;

  const tenantId = 'tenant_import_school_100';
  const campusId = 'campus_main_01';
  const userId = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    csvParser = new CsvParserService();
    auditService = new AuditService(prisma);
    importService = new DataImportService(prisma, csvParser, auditService);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'St. Paul Academy',
      status: 'ACTIVE',
    });
  });

  it('should parse CSV content and generate standard template headers', () => {
    const template = csvParser.getSampleTemplate('students');
    expect(template).toContain('firstName,lastName');
    expect(template).toContain('ADM-2026-001');

    const csvData = `firstName,lastName,admissionNumber,gender,dateOfBirth\nJohn,Doe,ADM-001,MALE,2012-04-10\nJane,Smith,ADM-002,FEMALE,2013-09-18`;
    const parsed = csvParser.parse(csvData);

    expect(parsed.headers).toContain('firstname');
    expect(parsed.headers).toContain('admissionnumber');
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0].firstname).toBe('John');
    expect(parsed.rows[1].gender).toBe('FEMALE');
  });

  it('should validate student CSV in DRY_RUN mode and catch missing fields and invalid dates', async () => {
    const invalidCsv = `firstName,lastName,admissionNumber,gender,dateOfBirth
,Doe,ADM-101,MALE,2012-04-10
Alice,,ADM-102,FEMALE,2012-04-10
Bob,Marley,,MALE,2012-04-10
Charlie,Brown,ADM-104,ALIEN,2012-04-10
David,Beck,ADM-105,MALE,invalid-date-format`;

    const result = await importService.importStudents(tenantId, campusId, userId, {
      csvContent: invalidCsv,
      mode: 'DRY_RUN',
    });

    expect(result.mode).toBe('DRY_RUN');
    expect(result.totalRows).toBe(5);
    expect(result.invalidRows).toBe(5);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);

    expect(result.errors.some((e) => e.column === 'firstName')).toBe(true);
    expect(result.errors.some((e) => e.column === 'lastName')).toBe(true);
    expect(result.errors.some((e) => e.column === 'admissionNumber')).toBe(true);
    expect(result.errors.some((e) => e.column === 'gender')).toBe(true);
    expect(result.errors.some((e) => e.column === 'dateOfBirth')).toBe(true);

    // Ensure no records were committed in dry-run
    const students = Array.from(prisma.memoryStore.students.values()).filter((s: any) => s.tenantId === tenantId);
    expect(students.length).toBe(0);
  });

  it('should detect duplicate admission numbers within CSV and against database', async () => {
    // 1. Seed existing student in tenant
    prisma.memoryStore.students.set('std_existing_1', {
      id: 'std_existing_1',
      tenantId,
      admissionNumber: 'ADM-EXISTING-01',
      firstName: 'Existing',
      lastName: 'Student',
    });

    // CSV containing duplicate inside CSV and duplicate with existing student
    const dupCsv = `firstName,lastName,admissionNumber,gender,dateOfBirth
Kemi,Ade,ADM-EXISTING-01,FEMALE,2012-01-01
Chidi,Obi,ADM-DUP-99,MALE,2012-02-02
Emeka,Obi,ADM-DUP-99,MALE,2012-03-03`;

    const result = await importService.importStudents(tenantId, campusId, userId, {
      csvContent: dupCsv,
      mode: 'DRY_RUN',
    });

    expect(result.invalidRows).toBe(2); // row 1 (existing in db) and row 3 (duplicate in CSV)
    expect(result.errors.some((e) => e.message.includes('already exists in school'))).toBe(true);
    expect(result.errors.some((e) => e.message.includes('Duplicate admission number in CSV'))).toBe(true);
  });

  it('should successfully commit valid student CSV and record import job audit', async () => {
    const validCsv = `firstName,lastName,admissionNumber,gender,dateOfBirth
Samuel,Jackson,ADM-2026-001,MALE,2012-06-15
Grace,Hopper,ADM-2026-002,FEMALE,2012-12-09`;

    const result = await importService.importStudents(tenantId, campusId, userId, {
      csvContent: validCsv,
      mode: 'COMMIT',
    });

    expect(result.mode).toBe('COMMIT');
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(0);
    expect(result.createdCount).toBe(2);
    expect(result.jobId).toBeDefined();

    // Verify stored student records
    const students = Array.from(prisma.memoryStore.students.values()).filter((s: any) => s.tenantId === tenantId);
    expect(students.length).toBe(2);
    expect(students.some((s: any) => s.admissionNumber === 'ADM-2026-001')).toBe(true);
    expect(students.some((s: any) => s.admissionNumber === 'ADM-2026-002')).toBe(true);

    // Verify import job in memory store
    const jobs = await importService.getImportJobs(tenantId);
    expect(jobs.length).toBe(1);
    expect(jobs[0].type).toBe('STUDENTS');
    expect(jobs[0].successfulRows).toBe(2);
  });
});
