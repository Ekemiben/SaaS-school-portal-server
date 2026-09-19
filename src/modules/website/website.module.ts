import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { WebsiteService } from './website.service.js';
import { WebsitePublicController } from './website-public.controller.js';
import { WebsiteAdminController } from './website-admin.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [WebsitePublicController, WebsiteAdminController],
  providers: [WebsiteService],
  exports: [WebsiteService],
})
export class WebsiteModule {}
