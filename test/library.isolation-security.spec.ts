import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../src/database/prisma.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { QueuesModule } from '../src/jobs/queues.module.js';
import { BookCatalogService } from '../src/modules/library/services/book-catalog.service.js';
import { BookCirculationService } from '../src/modules/library/services/book-circulation.service.js';
import { SystemPermissions } from '../src/common/constants/permissions.js';

describe('Library Multi-Tenant Isolation & Security', () => {
  let moduleRef: TestingModule;
  let catalogService: BookCatalogService;
  let circulationService: BookCirculationService;
  let prisma: PrismaService;

  const tenantA = 'tenant_lib_school_a';
  const tenantB = 'tenant_lib_school_b';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, QueuesModule],
      providers: [
        BookCatalogService,
        BookCirculationService,
      ],
    }).compile();

    catalogService = moduleRef.get<BookCatalogService>(BookCatalogService);
    circulationService = moduleRef.get<BookCirculationService>(BookCirculationService);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  it('should enforce strict cross-tenant isolation for catalog books and copies', async () => {
    const bookA = await catalogService.createBook(tenantA, 'campus_a', {
      title: 'Advanced Mathematics for School A',
      author: 'Author A',
      category: 'MATHEMATICS',
      initialCopies: 2,
    });

    const bookB = await catalogService.createBook(tenantB, 'campus_b', {
      title: 'Advanced Mathematics for School B',
      author: 'Author B',
      category: 'MATHEMATICS',
      initialCopies: 2,
    });

    const listA = await catalogService.listBooks(tenantA);
    const listB = await catalogService.listBooks(tenantB);

    expect(listA.some((b) => b.id === bookA.id)).toBe(true);
    expect(listA.some((b) => b.id === bookB.id)).toBe(false);

    expect(listB.some((b) => b.id === bookB.id)).toBe(true);
    expect(listB.some((b) => b.id === bookA.id)).toBe(false);

    // Cross-tenant lookup should throw NotFoundException
    await expect(catalogService.getBookById(tenantA, bookB.id)).rejects.toThrow('not found');
  });

  it('should prevent cross-tenant book issuing', async () => {
    prisma.memoryStore.students.set('std_tenant_a', {
      id: 'std_tenant_a',
      tenantId: tenantA,
      admissionNumber: 'ADM-A-001',
      firstName: 'Student',
      lastName: 'A',
      status: 'ACTIVE',
    });

    const bookB = await catalogService.createBook(tenantB, 'campus_b', {
      title: 'School B Chemistry',
      author: 'Author B',
      initialCopies: 1,
    });

    // Tenant A tries to issue Tenant B's book
    await expect(
      circulationService.issueBook(tenantA, 'campus_a', 'librarian_a', {
        bookId: bookB.id,
        studentId: 'std_tenant_a',
        dueDate: new Date(Date.now() + 7 * 3600 * 24 * 1000).toISOString(),
      }),
    ).rejects.toThrow('not found');
  });

  it('should define and export library permissions correctly', () => {
    expect(SystemPermissions.LIBRARY_VIEW).toBe('library.view');
    expect(SystemPermissions.LIBRARY_MANAGE).toBe('library.manage');
  });
});
