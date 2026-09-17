import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

// Services
import { PlatformAdminService } from './services/platform-admin.service.js';
import { ImpersonationService } from './services/impersonation.service.js';
import { PlatformUserService } from './services/platform-user.service.js';

// Controllers
import { PlatformAdminController } from './controllers/platform-admin.controller.js';
import { ImpersonationController } from './controllers/impersonation.controller.js';
import { PlatformUserController } from './controllers/platform-user.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    SubscriptionsModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_key_change_in_production_123',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [
    PlatformAdminController,
    ImpersonationController,
    PlatformUserController,
  ],
  providers: [
    PlatformAdminService,
    ImpersonationService,
    PlatformUserService,
  ],
  exports: [
    PlatformAdminService,
    ImpersonationService,
    PlatformUserService,
  ],
})
export class PlatformModule {}
