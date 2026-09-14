import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../src/modules/files/storage.provider.js';
import { BullmqService } from '../src/jobs/bullmq.service.js';
import { BulkInvoicingService } from '../src/modules/fees/services/bulk-invoicing.service.js';
import { SiblingDiscountCalculator } from '../src/modules/fees/calculator/sibling-discount-calculator.js';
import { InvoiceRenderer } from '../src/modules/fees/renderer/invoice-renderer.js';

describe('Automated Bulk Invoicing Engine & Sibling Discounts (Task 17 - Phase 8)', () => {
  let prisma: PrismaService;
  let storageProvider: CloudflareR2StorageProvider;
  let bullmqService: BullmqService;
  let bulkInvoicingService: BulkInvoicingService;

  const tenantA = 'tenant_bulk_inv_a';
  const tenantB = 'tenant_bulk_inv_b';
  const campusA = 'campus_bulk_a1';
  const campusB = 'campus_bulk_b1';
  const academicYear2026 = 'ay_2026_bulk';
  const term1 = 'term_1_bulk';
  const classGrade7 = 'cls_grade7_bulk';
  const classGrade8 = 'cls_grade8_bulk';

  const parentOkonkwo = 'prt_okonkwo_01';
  const studentOkonkwo1 = 'std_okon_01'; // 1st child (Elder)
  const studentOkonkwo2 = 'std_okon_02'; // 2nd child
  const studentOkonkwo3 = 'std_okon_03'; // 3rd child (Youngest)

  const parentAdeyemi = 'prt_adeyemi_01';
  const studentAdeyemi1 = 'std_ade_01'; // Only child

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    // Clean tenant memory stores for test isolation
    prisma.memoryStore.invoices.clear();
    prisma.memoryStore.feeWaivers?.clear();

    const configServiceMock: any = {
      get: vi.fn((key: string) => {
        if (key === 'CLOUDFLARE_R2_ACCOUNT_ID') return 'mock-account-id';
        if (key === 'CLOUDFLARE_R2_ACCESS_KEY_ID') return 'mock-access-key';
        if (key === 'CLOUDFLARE_R2_SECRET_ACCESS_KEY') return 'mock-secret-key';
        if (key === 'CLOUDFLARE_R2_BUCKET_NAME') return 'school-invoices';
        if (key === 'CLOUDFLARE_R2_PUBLIC_URL') return 'https://r2.schoolportal.ng';
        return undefined;
      }),
    };

    storageProvider = new CloudflareR2StorageProvider(configServiceMock);
    bullmqService = new BullmqService(configServiceMock);
    vi.spyOn(bullmqService, 'dispatch').mockResolvedValue('mock-job-id' as any);

    bulkInvoicingService = new BulkInvoicingService(prisma, storageProvider, bullmqService);

    // Populate memory store
    prisma.memoryStore.tenants.set(tenantA, {
      id: tenantA,
      name: 'Gracefield International Academy',
      currency: 'NGN',
    });
    prisma.memoryStore.tenants.set(tenantB, {
      id: tenantB,
      name: 'St. Saviour High School',
      currency: 'NGN',
    });

    prisma.memoryStore.campuses.set(campusA, {
      id: campusA,
      tenantId: tenantA,
      name: 'Lekki Main Campus',
    });
    prisma.memoryStore.campuses.set(campusB, {
      id: campusB,
      tenantId: tenantB,
      name: 'Victoria Island Campus',
    });

    prisma.memoryStore.classes.set(classGrade7, { id: classGrade7, tenantId: tenantA, name: 'JSS 1 Green' });
    prisma.memoryStore.classes.set(classGrade8, { id: classGrade8, tenantId: tenantA, name: 'JSS 2 Blue' });

    // Parents
    prisma.memoryStore.parents.set(parentOkonkwo, {
      id: parentOkonkwo,
      tenantId: tenantA,
      firstName: 'Emeka',
      lastName: 'Okonkwo',
      email: 'emeka.okonkwo@example.com',
      phone: '+2348011223344',
    });
    prisma.memoryStore.parents.set(parentAdeyemi, {
      id: parentAdeyemi,
      tenantId: tenantA,
      firstName: 'Babatunde',
      lastName: 'Adeyemi',
      email: 'babatunde.adeyemi@example.com',
      phone: '+2348099887766',
    });

    // Okonkwo Siblings (3 children)
    prisma.memoryStore.students.set(studentOkonkwo1, {
      id: studentOkonkwo1,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade8,
      admissionNumber: 'GIA/2024/001',
      firstName: 'Chidi',
      lastName: 'Okonkwo',
      status: 'ACTIVE',
      createdAt: new Date('2024-09-01'),
    });
    prisma.memoryStore.students.set(studentOkonkwo2, {
      id: studentOkonkwo2,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade7,
      admissionNumber: 'GIA/2025/042',
      firstName: 'Somto',
      lastName: 'Okonkwo',
      status: 'ACTIVE',
      createdAt: new Date('2025-09-01'),
    });
    prisma.memoryStore.students.set(studentOkonkwo3, {
      id: studentOkonkwo3,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade7,
      admissionNumber: 'GIA/2026/105',
      firstName: 'Adaobi',
      lastName: 'Okonkwo',
      status: 'ACTIVE',
      createdAt: new Date('2026-09-01'),
    });

    // Adeyemi (1 child)
    prisma.memoryStore.students.set(studentAdeyemi1, {
      id: studentAdeyemi1,
      tenantId: tenantA,
      campusId: campusA,
      currentClassId: classGrade7,
      admissionNumber: 'GIA/2026/110',
      firstName: 'Femi',
      lastName: 'Adeyemi',
      status: 'ACTIVE',
      createdAt: new Date('2026-09-01'),
    });

    // Parent Student Links
    if (!prisma.memoryStore.studentParents) {
      prisma.memoryStore.studentParents = new Map();
    }
    prisma.memoryStore.studentParents.set('sp_1', { id: 'sp_1', studentId: studentOkonkwo1, parentId: parentOkonkwo });
    prisma.memoryStore.studentParents.set('sp_2', { id: 'sp_2', studentId: studentOkonkwo2, parentId: parentOkonkwo });
    prisma.memoryStore.studentParents.set('sp_3', { id: 'sp_3', studentId: studentOkonkwo3, parentId: parentOkonkwo });
    prisma.memoryStore.studentParents.set('sp_4', { id: 'sp_4', studentId: studentAdeyemi1, parentId: parentAdeyemi });

    // Fee Structure
    const feeStructureId = 'fee_struct_2026_term1';
    prisma.memoryStore.feeStructures.set(feeStructureId, {
      id: feeStructureId,
      tenantId: tenantA,
      campusId: campusA,
      academicYearId: academicYear2026,
      name: 'First Term Junior Tuition & Levies',
      amount: 250000,
      dueDate: new Date('2026-10-31'),
      items: [
        { name: 'Tuition Fee', code: 'TUI', amount: 200000, category: 'TUITION', isOptional: false },
        { name: 'Laboratory & Science Kit', code: 'LAB', amount: 30000, category: 'ACADEMIC', isOptional: false },
        { name: 'PTA & Development Levy', code: 'PTA', amount: 20000, category: 'LEVY', isOptional: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('1. Sibling Discount Calculator & Progressive Policy', () => {
    const sampleLineItems = [
      { name: 'Tuition Fee', category: 'TUITION', amount: 200000, isIncluded: true },
      { name: 'Laboratory Fee', category: 'ACADEMIC', amount: 30000, isIncluded: true },
      { name: 'PTA Levy', category: 'LEVY', amount: 20000, isIncluded: true },
    ];

    it('applies 0% sibling discount to the 1st child (oldest/first enrolled)', () => {
      const result = SiblingDiscountCalculator.evaluateSiblingDiscount({
        studentIndex: 0,
        totalSiblings: 3,
        lineItems: sampleLineItems,
      });

      expect(result.discountPercentage).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.tierName).toBe('1st Child (Full Tuition)');
    });

    it('applies 10% discount on tuition only to 2nd child', () => {
      const result = SiblingDiscountCalculator.evaluateSiblingDiscount({
        studentIndex: 1,
        totalSiblings: 3,
        lineItems: sampleLineItems,
      });

      expect(result.discountPercentage).toBe(10);
      expect(result.discountAmount).toBe(20000); // 10% of 200,000 tuition
      expect(result.tierName).toBe('2nd Child (10% Sibling Discount)');
    });

    it('applies 20% discount on tuition only to 3rd child', () => {
      const result = SiblingDiscountCalculator.evaluateSiblingDiscount({
        studentIndex: 2,
        totalSiblings: 3,
        lineItems: sampleLineItems,
      });

      expect(result.discountPercentage).toBe(20);
      expect(result.discountAmount).toBe(40000); // 20% of 200,000 tuition
      expect(result.tierName).toBe('3rd Child (20% Sibling Discount)');
    });

    it('applies 30% discount on tuition only to 4th+ child', () => {
      const result = SiblingDiscountCalculator.evaluateSiblingDiscount({
        studentIndex: 3,
        totalSiblings: 4,
        lineItems: sampleLineItems,
      });

      expect(result.discountPercentage).toBe(30);
      expect(result.discountAmount).toBe(60000); // 30% of 200,000 tuition
      expect(result.tierName).toBe('4th+ Child (30% Sibling Discount)');
    });
  });

  describe('2. Family Sibling Breakdown Discovery', () => {
    it('retrieves accurate sibling hierarchy and eligibility for a parent with 3 children', async () => {
      const breakdown = await bulkInvoicingService.getFamilySiblingBreakdown(tenantA, parentOkonkwo);

      expect(breakdown.totalChildren).toBe(3);
      expect(breakdown.isEligibleForSiblingDiscount).toBe(true);
      expect(breakdown.siblings).toHaveLength(3);
      expect(breakdown.siblings[0].childIndex).toBe(1);
      expect(breakdown.siblings[0].discountPercentage).toBe(0);
      expect(breakdown.siblings[1].childIndex).toBe(2);
      expect(breakdown.siblings[1].discountPercentage).toBe(10);
      expect(breakdown.siblings[2].childIndex).toBe(3);
      expect(breakdown.siblings[2].discountPercentage).toBe(20);
    });

    it('correctly handles single-child family as not eligible for sibling discounts', async () => {
      const breakdown = await bulkInvoicingService.getFamilySiblingBreakdown(tenantA, parentAdeyemi);

      expect(breakdown.totalChildren).toBe(1);
      expect(breakdown.isEligibleForSiblingDiscount).toBe(false);
      expect(breakdown.siblings[0].discountPercentage).toBe(0);
    });
  });

  describe('3. Automated Bulk Invoicing Engine', () => {
    it('executes dry-run preview mode without persisting invoices', async () => {
      const preview = await bulkInvoicingService.bulkGenerateInvoices(tenantA, 'user_admin', {
        campusId: campusA,
        academicYearId: academicYear2026,
        termId: term1,
        dueDate: '2026-10-31',
        dryRun: true,
      });

      expect(preview.dryRun).toBe(true);
      expect(preview.totalStudents).toBe(4);
      expect(preview.invoicesCreated).toBe(4);
      expect(preview.invoicesSkipped).toBe(0);
      expect(preview.totalSubtotal).toBe(1000000); // 4 students * 250,000
      // Discounts: Child1=0, Child2=20k, Child3=40k, Adeyemi=0 => total 60k discount
      expect(preview.totalDiscountAmount).toBe(60000);
      expect(preview.totalBilledAmount).toBe(940000); // 1,000,000 - 60,000

      // Invoices not stored in memory store during dry-run
      expect(prisma.memoryStore.invoices.size).toBe(0);
    });

    it('generates, persists invoices and queues notifications for all campus students', async () => {
      const result = await bulkInvoicingService.bulkGenerateInvoices(tenantA, 'user_admin', {
        campusId: campusA,
        academicYearId: academicYear2026,
        termId: term1,
        dueDate: '2026-10-31',
        notifyParents: true,
      });

      expect(result.dryRun).toBe(false);
      expect(result.invoicesCreated).toBe(4);
      expect(prisma.memoryStore.invoices.size).toBe(4);

      // Check specific invoice amounts for the 3 siblings
      const invChild1 = result.invoices.find((i: any) => i.studentId === studentOkonkwo1);
      const invChild2 = result.invoices.find((i: any) => i.studentId === studentOkonkwo2);
      const invChild3 = result.invoices.find((i: any) => i.studentId === studentOkonkwo3);
      const invAdeyemi = result.invoices.find((i: any) => i.studentId === studentAdeyemi1);

      expect(invChild1.siblingDiscountAmount).toBe(0);
      expect(invChild1.totalAmount).toBe(250000);

      expect(invChild2.siblingDiscountAmount).toBe(20000); // 10% on 200k tuition
      expect(invChild2.totalAmount).toBe(230000);

      expect(invChild3.siblingDiscountAmount).toBe(40000); // 20% on 200k tuition
      expect(invChild3.totalAmount).toBe(210000);

      expect(invAdeyemi.siblingDiscountAmount).toBe(0);
      expect(invAdeyemi.totalAmount).toBe(250000);

      // Verify notification jobs queued
      expect(bullmqService.dispatch).toHaveBeenCalled();
    });

    it('prevents duplicate invoice generation for the same student, term, and academic year', async () => {
      const secondRun = await bulkInvoicingService.bulkGenerateInvoices(tenantA, 'user_admin', {
        campusId: campusA,
        academicYearId: academicYear2026,
        termId: term1,
        dueDate: '2026-10-31',
      });

      expect(secondRun.invoicesCreated).toBe(0);
      expect(secondRun.invoicesSkipped).toBe(4);
      expect(prisma.memoryStore.invoices.size).toBe(4); // No new duplicates added
    });

    it('generates presigned download link for student invoice', async () => {
      const invChild1 = Array.from(prisma.memoryStore.invoices.values()).find(
        (i: any) => i.tenantId === tenantA,
      );
      const download = await bulkInvoicingService.getInvoiceDownload(tenantA, invChild1.id);

      expect(download.downloadUrl).toBeDefined();
      expect(download.downloadUrl).toContain(`tenants/${tenantA}/invoices/`);
      expect(download.expiresAt).toBeDefined();
    });
  });

  describe('4. Branded HTML Invoice Rendering', () => {
    it('renders clean HTML invoice with itemized breakdown, discounts, and payment metadata', () => {
      const html = InvoiceRenderer.renderHtml({
        school: {
          name: 'Gracefield International Academy',
          currency: 'NGN',
        },
        student: {
          fullName: 'Somto Okonkwo',
          admissionNumber: 'GIA/2025/042',
          className: 'JSS 1 Green',
        },
        parent: {
          name: 'Emeka Okonkwo',
          email: 'emeka.okonkwo@example.com',
          phone: '+2348011223344',
        },
        invoice: {
          id: 'inv_test_01',
          invoiceNumber: 'INV-2026-0002',
          status: 'PENDING',
          issuedAt: '2026-09-15',
          dueDate: '2026-10-31',
          subtotal: 250000,
          discountAmount: 20000,
          waiverAmount: 0,
          latePenaltyAmount: 0,
          totalAmount: 230000,
          paidAmount: 0,
          balanceAmount: 230000,
          currency: 'NGN',
          lineItems: [
            { name: 'Tuition Fee', code: 'TUI', amount: 200000, isIncluded: true },
            { name: 'Laboratory & Science Kit', code: 'LAB', amount: 30000, isIncluded: true },
            { name: 'PTA & Development Levy', code: 'PTA', amount: 20000, isIncluded: true },
          ],
        },
      });

      expect(html).toContain('Gracefield International Academy');
      expect(html).toContain('INV-2026-0002');
      expect(html).toContain('Somto Okonkwo');
      expect(html).toContain('230,000');
    });
  });

  describe('5. Multi-Tenant Isolation', () => {
    it('ensures Tenant B cannot access or download Tenant A invoices', async () => {
      const tenantAInvoice = Array.from(prisma.memoryStore.invoices.values()).find(
        (i: any) => i.tenantId === tenantA,
      );

      await expect(
        bulkInvoicingService.getInvoiceDownload(tenantB, tenantAInvoice.id),
      ).rejects.toThrow();
    });
  });
});
