import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { CloudflareR2StorageProvider } from './storage.provider.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [StorageModule],
  controllers: [FilesController],
  providers: [CloudflareR2StorageProvider, FilesService],
  exports: [CloudflareR2StorageProvider, FilesService],
})
export class FilesModule {}
