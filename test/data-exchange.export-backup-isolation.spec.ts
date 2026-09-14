import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { CsvParserService } from '../src/modules/data-exchange/services/csv-parser.service.js';
import { DataExportService } from '../src/modules/data-exchange/services/data-export.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';

describe('Tenant Data Export & Backup Engine (Isolation & Anonymization)', () => {
  let prisma: PrismaService;
  let csvParser: CsvParserService;
  let auditService: AuditService;
  let exportService: DataExportService;

  const tenantA = 'tenant_alpha_101';
  const tenantB = 'tenant_bravo_202';
  const userId = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    csvParser = new CsvParserService();
    auditService = new AuditService(prisma);
    exportService = new DataExportService(prisma, csvParser, auditService);

    // Seed Tenant A
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Alpha Academy',
      slug: 'alpha-academy',
      status: 'ACTIVE',
    });

    // Seed Tenant B
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'Bravo High School',
      slug: 'bravo-high',
      status: 'ACTIVE',
    });

    // Seed students for Tenant A
    prisma.memoryStore.students.set('std_a1', {
      id: 'std_a1',
      tenantId: tenantA,
      admissionNumber: 'ALPHA-001',
      firstName: 'Alice',
      lastName: 'Alpha',
      email: 'alice@alpha.edu',
      status: 'ACTIVE',
    });

    // Seed students for Tenant B
    prisma.memoryStore.students.set('std_b1', {
      id: 'std_b1',
      tenantId: tenantB,
      admissionNumber: 'BRAVO-001',
      firstName: 'Bob',
      lastName: 'Bravo',
      email: 'bob@bravo.edu',
      status: 'ACTIVE',
    });

    // Seed teachers for Tenant A
    prisma.memoryStore.teachers.set('tch_a1', {
      id: 'tch_a1',
      tenantId: tenantA,
      employeeNumber: 'EMP-A1',
      firstName: 'Teacher',
      lastName: 'Alpha',
      email: 'teacher.a@alpha.edu',
      designation: 'Math Teacher',
      status: 'ACTIVE',
    });

    // Seed inventory item for Tenant A
    prisma.memoryStore.inventoryItems.set('inv_a1', {
      id: 'inv_a1',
      tenantId: tenantA,
      sku: 'SKU-SCI-01',
      name: 'Microscope Lens',
      category: 'SCIENCE_LAB',
      unitOfMeasure: 'PCS',
      unitCost: 15000,
      quantityOnHand: 10,
      status: 'ACTIVE',
    });

    // Seed school asset for Tenant A
    prisma.memoryStore.schoolAssets.set('ast_a1', {
      id: 'ast_a1',
      tenantId: tenantA,
      assetTag: 'AST-BUS-01',
      name: 'School Bus 32-Seater',
      category: 'VEHICLE',
      purchaseCost: 25000000,
      currentBookValue: 20000000,
      condition: 'GOOD',
      status: 'IN_USE',
    });
  });

  it('should generate complete JSON backup snapshot isolated strictly to tenant data', async () => {
    const backupA = await exportService.getFullTenantBackupSnapshot(tenantA, false);

    expect(backupA.metadata.tenantId).toBe(tenantA);
    expect(backupA.metadata.tenantName).toBe('Alpha Academy');
    expect(backupA.metadata.isAnonymized).toBe(false);

    // Verify Tenant A records are present
    expect(backupA.data.students.length).toBe(1);
    expect(backupA.data.students[0].admissionNumber).toBe('ALPHA-001');
    expect(backupA.data.teachers.length).toBe(1);
    expect(backupA.data.inventoryItems.length).toBe(1);
    expect(backupA.data.schoolAssets.length).toBe(1);

    // Verify Tenant B records are strictly isolated and not included in A's backup
    const containsTenantBStudent = backupA.data.students.some((s: any) => s.tenantId === tenantB || s.admissionNumber === 'BRAVO-001');
    expect(containsTenantBStudent).toBe(false);
  });

  it('should anonymize personally identifiable information when requested in backup', async () => {
    const anonBackup = await exportService.getFullTenantBackupSnapshot(tenantA, true);

    expect(anonBackup.metadata.isAnonymized).toBe(true);
    expect(anonBackup.data.students[0].firstName).toBe('Anonymized');
    expect(anonBackup.data.students[0].lastName).toBe('User_d_a1');
    expect(anonBackup.data.students[0].email).toContain('@anonymized.local');

    expect(anonBackup.data.teachers[0].firstName).toBe('Anonymized');
    expect(anonBackup.data.teachers[0].email).toContain('@anonymized.local');
  });

  it('should export entity CSVs with proper header columns and data formatting', async () => {
    const studentCsv = await exportService.exportEntityCsv(tenantA, 'students');
    expect(studentCsv).toContain('id,admissionNumber,firstName,lastName,gender,dateOfBirth,status');
    expect(studentCsv).toContain('ALPHA-001');
    expect(studentCsv).not.toContain('BRAVO-001');

    const staffCsv = await exportService.exportEntityCsv(tenantA, 'teachers');
    expect(staffCsv).toContain('id,employeeNumber,firstName,lastName,email,designation,status');
    expect(staffCsv).toContain('EMP-A1');

    const invCsv = await exportService.exportEntityCsv(tenantA, 'inventory');
    expect(invCsv).toContain('id,sku,name,category,unitOfMeasure,unitCost,quantityOnHand,status');
    expect(invCsv).toContain('SKU-SCI-01');

    const assetCsv = await exportService.exportEntityCsv(tenantA, 'assets');
    expect(assetCsv).toContain('id,assetTag,name,category,purchaseCost,currentBookValue,condition,status');
    expect(assetCsv).toContain('AST-BUS-01');
  });

  it('should manage asynchronous export jobs and enforce tenant isolation on lookup', async () => {
    const job = await exportService.createExportJob(tenantA, userId, {
      format: 'JSON',
      anonymize: false,
    });

    expect(job.id).toBeDefined();
    expect(job.tenantId).toBe(tenantA);
    expect(job.status).toBe('COMPLETED');
    expect(job.fileUrl).toContain(tenantA);
    expect(job.fileSizeBytes).toBeGreaterThan(0);

    // Fetch job with correct tenant
    const fetched = await exportService.getExportJob(tenantA, job.id);
    expect(fetched.id).toBe(job.id);

    // List jobs for Tenant A
    const jobsA = await exportService.listExportJobs(tenantA);
    expect(jobsA.length).toBe(1);

    // Tenant B cannot access Tenant A's export job
    await expect(exportService.getExportJob(tenantB, job.id)).rejects.toThrow();

    const jobsB = await exportService.listExportJobs(tenantB);
    expect(jobsB.length).toBe(0);
  });
});
