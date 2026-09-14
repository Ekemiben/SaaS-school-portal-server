import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { CsvParserService } from '../src/modules/data-exchange/services/csv-parser.service.js';
import { DataImportService } from '../src/modules/data-exchange/services/data-import.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';

describe('Bulk CSV Data Import (Staff & Grades)', () => {
  let prisma: PrismaService;
  let csvParser: CsvParserService;
  let auditService: AuditService;
  let importService: DataImportService;

  const tenantId = 'tenant_grades_school_200';
  const campusId = 'campus_main_01';
  const userId = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    csvParser = new CsvParserService();
    auditService = new AuditService(prisma);
    importService = new DataImportService(prisma, csvParser, auditService);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Highland International School',
      status: 'ACTIVE',
    });
  });

  it('should validate and commit staff member imports', async () => {
    const staffCsv = `firstName,lastName,email,staffNumber,designation,department
Alan,Turing,a.turing@highland.edu.ng,STF-101,Senior Teacher,Mathematics
Ada,Lovelace,a.lovelace@highland.edu.ng,STF-102,Head of Department,Computer Science`;

    // 1. Dry run
    const dryRun = await importService.importStaff(tenantId, campusId, userId, {
      csvContent: staffCsv,
      mode: 'DRY_RUN',
    });
    expect(dryRun.validRows).toBe(2);
    expect(dryRun.invalidRows).toBe(0);

    // 2. Commit mode
    const commitRes = await importService.importStaff(tenantId, campusId, userId, {
      csvContent: staffCsv,
      mode: 'COMMIT',
    });
    expect(commitRes.createdCount).toBe(2);

    const teachers = Array.from(prisma.memoryStore.teachers.values()).filter((t: any) => t.tenantId === tenantId);
    expect(teachers.length).toBe(2);
    expect(teachers.some((t: any) => t.employeeNumber === 'STF-101')).toBe(true);
    expect(teachers.some((t: any) => t.employeeNumber === 'STF-102')).toBe(true);
  });

  it('should validate score boundaries and calculate grades automatically on grade import', async () => {
    // 1. Invalid scores CSV (CA1 > 20, exam > 60)
    const invalidGradesCsv = `admissionNumber,subjectCode,academicYear,term,classCode,ca1Score,ca2Score,examScore
ADM-001,MATH-101,2026/2027,FIRST_TERM,G10-A,25,15,50
ADM-002,MATH-101,2026/2027,FIRST_TERM,G10-A,18,18,75`;

    const dryRunInvalid = await importService.importGrades(tenantId, campusId, userId, {
      csvContent: invalidGradesCsv,
      mode: 'DRY_RUN',
    });

    expect(dryRunInvalid.invalidRows).toBe(2);
    expect(dryRunInvalid.errors.some((e) => e.column === 'ca1Score')).toBe(true);
    expect(dryRunInvalid.errors.some((e) => e.column === 'examScore')).toBe(true);

    // 2. Valid scores CSV
    const validGradesCsv = `admissionNumber,subjectCode,academicYear,term,classCode,ca1Score,ca2Score,examScore
ADM-001,MATH-101,2026/2027,FIRST_TERM,G10-A,18,17,55
ADM-002,MATH-101,2026/2027,FIRST_TERM,G10-A,10,12,30`;

    const commitRes = await importService.importGrades(tenantId, campusId, userId, {
      csvContent: validGradesCsv,
      mode: 'COMMIT',
    });

    expect(commitRes.createdCount).toBe(2);

    const results = Array.from(prisma.memoryStore.results.values()).filter((r: any) => r.tenantId === tenantId);
    expect(results.length).toBe(2);

    // Row 1: 18 + 17 + 55 = 90 -> Grade A
    const resA = results.find((r: any) => r.totalScore === 90);
    expect(resA).toBeDefined();
    expect(resA.grade).toBe('A');

    // Row 2: 10 + 12 + 30 = 52 -> Grade C
    const resC = results.find((r: any) => r.totalScore === 52);
    expect(resC).toBeDefined();
    expect(resC.grade).toBe('C');
  });
});
