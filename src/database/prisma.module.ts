import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RlsHelper } from './rls.helper.js';

@Global()
@Module({
  providers: [PrismaService, RlsHelper],
  exports: [PrismaService, RlsHelper],
})
export class PrismaModule {}
