import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { CloudflareR2StorageProvider } from './storage.provider.js';

@Module({
  controllers: [FilesController],
  providers: [CloudflareR2StorageProvider, FilesService],
  exports: [CloudflareR2StorageProvider, FilesService],
})
export class FilesModule {}
