import { Module } from '@nestjs/common';
import { TenancyController } from './tenancy.controller.js';
import { TenancyService } from './tenancy.service.js';
import { CustomDomainService } from './custom-domain.service.js';
import { CloudflareDomainProvider } from './cloudflare-domain.provider.js';

@Module({
  controllers: [TenancyController],
  providers: [CloudflareDomainProvider, CustomDomainService, TenancyService],
  exports: [CloudflareDomainProvider, CustomDomainService, TenancyService],
})
export class TenancyModule {}

