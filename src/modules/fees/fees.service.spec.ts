import { describe, it, expect, beforeEach } from 'vitest';
import { FeesService } from './fees.service.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('FeesService Waivers and Calculations', () => {
  let feesService: FeesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = new PrismaService();
    feesService = new FeesService(prisma);
  });

  it('should apply fee waiver and reduce invoice balance amount', async () => {
    const feeStructure = await feesService.createFeeStructure('tenant_greenfield_100', {
      academicYearId: 'ay_2026_2027',
      termId: 'term_first_2026',
      classId: 'cls_grade10_a',
      name: 'Term 1 Tuition',
      description: 'Regular Term Tuition',
      currency: 'NGN',
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      items: [{ name: 'Tuition Fee', amount: 100000 }],
    });

    const invoice = await feesService.generateInvoice('tenant_greenfield_100', {
      studentId: 'std_john_doe_01',
      feeStructureId: feeStructure.id,
      dueDate: feeStructure.dueDate,
    });

    expect(invoice.totalAmount).toBe(100000);
    expect(invoice.balanceAmount).toBe(100000);

    const result = await feesService.applyFeeWaiver('tenant_greenfield_100', {
      invoiceId: invoice.id,
      studentId: 'std_john_doe_01',
      waiverType: 'SCHOLARSHIP',
      amount: 25000,
      reason: 'Academic Excellence Scholarship (25%)',
    });

    expect(result.waiver).toBeDefined();
    expect(result.waiver.amount).toBe(25000);
    expect(result.updatedInvoice.balanceAmount).toBe(75000);
  });
});
