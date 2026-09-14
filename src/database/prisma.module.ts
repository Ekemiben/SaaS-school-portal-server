import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RlsHelper } from './rls.helper.js';
import { DatabaseSeederService } from './seeder.service.js';

@Global()
@Module({
  providers: [PrismaService, RlsHelper, DatabaseSeederService],
  exports: [PrismaService, RlsHelper, DatabaseSeederService],
})
export class PrismaModule {}
