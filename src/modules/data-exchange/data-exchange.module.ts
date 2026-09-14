import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';

// Services
import { CsvParserService } from './services/csv-parser.service.js';
import { DataImportService } from './services/data-import.service.js';
import { DataExportService } from './services/data-export.service.js';

// Controllers
import { DataImportController } from './controllers/data-import.controller.js';
import { DataExportController } from './controllers/data-export.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DataImportController, DataExportController],
  providers: [
    CsvParserService,
    DataImportService,
    DataExportService,
  ],
  exports: [
    CsvParserService,
    DataImportService,
    DataExportService,
  ],
})
export class DataExchangeModule {}
