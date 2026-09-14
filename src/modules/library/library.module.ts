import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';
import { BookCatalogService } from './services/book-catalog.service.js';
import { BookCirculationService } from './services/book-circulation.service.js';
import { BookReservationService } from './services/book-reservation.service.js';
import { LibraryFineService } from './services/library-fine.service.js';
import { LibraryAnalyticsService } from './services/library-analytics.service.js';
import { LibraryCatalogController } from './controllers/library-catalog.controller.js';
import { LibraryCirculationController } from './controllers/library-circulation.controller.js';
import { LibraryReservationController } from './controllers/library-reservation.controller.js';
import { LibraryFinesController } from './controllers/library-fines.controller.js';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [
    LibraryCatalogController,
    LibraryCirculationController,
    LibraryReservationController,
    LibraryFinesController,
  ],
  providers: [
    BookCatalogService,
    BookCirculationService,
    BookReservationService,
    LibraryFineService,
    LibraryAnalyticsService,
  ],
  exports: [
    BookCatalogService,
    BookCirculationService,
    BookReservationService,
    LibraryFineService,
    LibraryAnalyticsService,
  ],
})
export class LibraryModule {}
