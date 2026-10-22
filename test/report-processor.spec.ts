import { describe, it, expect, vi } from 'vitest';
import { ReportProcessor } from '../src/jobs/processors/report.processor.js';

describe('Phase 5: Real Background Report Compilation Verification', () => {
  const mockStorageService: any = {
    uploadBuffer: vi.fn().mockResolvedValue({ storageKey: 'reports/fee_summary_123.txt' }),
    getDownloadPresignedUrl: vi.fn().mockResolvedValue('https://storage.schoolportal.io/reports/fee_summary_123.txt?presigned=true'),
  };

  const mockPrisma: any = {
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 1850000 }, _count: { id: 14 } }),
    },
    invoice: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { totalAmount: 2500000, paidAmount: 1850000, balanceAmount: 650000 },
        _count: { id: 20 },
      }),
    },
    attendance: { count: vi.fn().mockResolvedValue(120) },
    staffAttendanceRecord: { count: vi.fn().mockResolvedValue(15) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ name: 'Queen School', slug: 'queensschoolcom' }) },
    student: { count: vi.fn().mockResolvedValue(450) },
    staff: { count: vi.fn().mockResolvedValue(32) },
  };

  const processor = new ReportProcessor(mockPrisma, mockStorageService);

  it('compiles real fee aggregate metrics instead of mock stub', async () => {
    const res = await processor.process({
      id: 'job-fee-01',
      data: {
        reportType: 'fee-summary',
        tenantId: 'tenant-test-1',
        parameters: {},
        requestedByUserId: 'usr-admin-1',
      },
    });

    expect(res.status).toBe('completed');
    expect(res.artifactKey).toBe('reports/fee_summary_123.txt');
    expect(res.downloadUrl).toContain('presigned=true');
    expect(mockStorageService.uploadBuffer).toHaveBeenCalled();

    // Verify buffer content contains real compiled figures
    const callArgs = mockStorageService.uploadBuffer.mock.calls[0];
    const uploadedBuffer = callArgs[3] as Buffer;
    const content = uploadedBuffer.toString('utf8');

    expect(content).not.toContain('%PDF-1.4 Mock Report');
    expect(content).toContain('OFFICIAL INSTITUTIONAL FINANCIAL LEDGER REPORT');
    expect(content).toContain('Total Invoices Generated: 20');
    expect(content).toContain('Total Fees Collected:  ₦1,850,000');
    expect(content).toContain('Total Outstanding:     ₦650,000');
  });

  it('compiles real enrolment and academic metrics for school report', async () => {
    const res = await processor.process({
      id: 'job-acad-01',
      data: {
        reportType: 'report-card',
        tenantId: 'tenant-test-1',
        parameters: {},
        requestedByUserId: 'usr-admin-1',
      },
    });

    expect(res.status).toBe('completed');
    const callArgs = mockStorageService.uploadBuffer.mock.calls[1];
    const content = (callArgs[3] as Buffer).toString('utf8');

    expect(content).toContain('Queen School');
    expect(content).toContain('Total Enrolled Students: 450');
    expect(content).toContain('Total Certified Staff:    32');
  });
});
