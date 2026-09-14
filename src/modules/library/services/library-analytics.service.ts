import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { LibraryStatsFilterDto } from '../dto/library-filter.dto.js';

@Injectable()
export class LibraryAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLibraryStats(tenantId: string, filter?: LibraryStatsFilterDto) {
    let books = Array.from(this.prisma.memoryStore.books.values()).filter(
      (b) => b.tenantId === tenantId,
    );
    if (filter?.campusId) books = books.filter((b) => b.campusId === filter.campusId);

    let copies = Array.from(this.prisma.memoryStore.bookCopies.values()).filter(
      (c) => c.tenantId === tenantId,
    );
    if (filter?.campusId) copies = copies.filter((c) => c.campusId === filter.campusId);

    let issues = Array.from(this.prisma.memoryStore.bookIssues.values()).filter(
      (i) => i.tenantId === tenantId,
    );
    if (filter?.campusId) issues = issues.filter((i) => i.campusId === filter.campusId);

    let reservations = Array.from(this.prisma.memoryStore.bookReservations.values()).filter(
      (r) => r.tenantId === tenantId,
    );
    if (filter?.campusId) reservations = reservations.filter((r) => r.campusId === filter.campusId);

    let fines = Array.from(this.prisma.memoryStore.libraryFines.values()).filter(
      (f) => f.tenantId === tenantId,
    );
    if (filter?.campusId) fines = fines.filter((f) => f.campusId === filter.campusId);

    const totalTitles = books.length;
    const totalCopies = copies.length;
    const availableCopies = copies.filter((c) => c.status === 'AVAILABLE').length;
    const borrowedCopies = copies.filter((c) => c.status === 'ISSUED').length;
    const activeLoans = issues.filter((i) => i.status === 'ACTIVE').length;
    const overdueLoans = issues.filter((i) => i.status === 'OVERDUE').length;
    const activeReservations = reservations.filter((r) => r.status === 'ACTIVE_WAITING' || r.status === 'READY_FOR_PICKUP').length;

    // Fines aggregates
    const totalFinesLevied = fines.reduce((acc, f) => acc + f.totalAmount, 0);
    const totalFinesCollected = fines.reduce((acc, f) => acc + f.paidAmount, 0);
    const totalFinesOutstanding = fines.reduce((acc, f) => acc + (f.status !== 'WAIVED' ? f.balanceDue : 0), 0);

    // Top 5 most borrowed books
    const bookBorrowCounts = new Map<string, number>();
    for (const issue of issues) {
      bookBorrowCounts.set(issue.bookId, (bookBorrowCounts.get(issue.bookId) || 0) + 1);
    }
    const topBooks = Array.from(bookBorrowCounts.entries())
      .map(([bookId, count]) => {
        const book = this.prisma.memoryStore.books.get(bookId);
        return {
          bookId,
          title: book?.title || 'Unknown Title',
          author: book?.author || 'Unknown Author',
          category: book?.category,
          borrowCount: count,
        };
      })
      .sort((a, b) => b.borrowCount - a.borrowCount)
      .slice(0, 5);

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const b of books) {
      categoryBreakdown[b.category] = (categoryBreakdown[b.category] || 0) + 1;
    }

    return {
      totalTitles,
      totalCopies,
      availableCopies,
      borrowedCopies,
      activeLoans,
      overdueLoans,
      activeReservations,
      finesSummary: {
        totalLevied: totalFinesLevied,
        totalCollected: totalFinesCollected,
        totalOutstanding: totalFinesOutstanding,
      },
      topBorrowedBooks: topBooks,
      categoryDistribution: categoryBreakdown,
    };
  }

  async getOverdueReport(tenantId: string, campusId?: string) {
    const now = new Date();
    let overdueIssues = Array.from(this.prisma.memoryStore.bookIssues.values()).filter(
      (i) =>
        i.tenantId === tenantId &&
        (i.status === 'OVERDUE' || (i.status === 'ACTIVE' && new Date(i.dueDate) < now)),
    );

    if (campusId) overdueIssues = overdueIssues.filter((i) => i.campusId === campusId);

    return overdueIssues.map((i) => {
      const book = this.prisma.memoryStore.books.get(i.bookId);
      const student = i.studentId ? this.prisma.memoryStore.students.get(i.studentId) : null;
      const copy = i.bookCopyId ? this.prisma.memoryStore.bookCopies.get(i.bookCopyId) : null;
      const overdueDays = Math.max(1, Math.ceil((now.getTime() - new Date(i.dueDate).getTime()) / (1000 * 3600 * 24)));

      return {
        issueId: i.id,
        bookTitle: book?.title,
        author: book?.author,
        accessionNumber: copy?.accessionNumber,
        barcode: copy?.barcode,
        borrowerName: student ? `${student.firstName} ${student.lastName}` : 'Patron',
        admissionNumber: student?.admissionNumber || '',
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        overdueDays,
        estimatedFine: overdueDays * 100.0,
      };
    });
  }
}
