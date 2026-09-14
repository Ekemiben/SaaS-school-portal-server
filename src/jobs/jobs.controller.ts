import {
  Controller,
  Get,
  Post,
  Param,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QueueService } from './queue.service.js';
import { RequireRoles } from '../common/decorators/roles.decorator.js';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator.js';
import type { TenantContext } from '../common/types/tenant-context.interface.js';

@Controller('api/v1/jobs')
export class JobsController {
  constructor(private readonly queueService: QueueService) {}

  @Get('status/:queueName/:jobId')
  @RequireRoles('SUPER_ADMIN', 'TENANT_ADMIN', 'CAMPUS_ADMIN', 'ACCOUNTANT', 'TEACHER')
  async getJobStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.queueService.getJobStatus(queueName, jobId);
    if (!job) {
      throw new NotFoundException(`Job [${jobId}] not found in queue [${queueName}].`);
    }

    if (job.tenantId && job.tenantId !== tenant.tenantId) {
      throw new ForbiddenException('Cross-tenant job access violation.');
    }

    return job;
  }

  @Get('dlq')
  @RequireRoles('SUPER_ADMIN', 'TENANT_ADMIN')
  async getDeadLetterJobs(@CurrentTenant() tenant: TenantContext) {
    return this.queueService.getDeadLetterJobs(tenant.tenantId);
  }

  @Post('dlq/:jobId/retry')
  @RequireRoles('SUPER_ADMIN', 'TENANT_ADMIN')
  async retryDeadLetterJob(
    @CurrentTenant() tenant: TenantContext,
    @Param('jobId') jobId: string,
  ) {
    const dlqJobs = this.queueService.getDeadLetterJobs(tenant.tenantId);
    const target = dlqJobs.find((j) => j.id === jobId);
    if (!target) {
      throw new NotFoundException(`Dead-letter job [${jobId}] not found for your tenant.`);
    }

    return await this.queueService.retryDeadLetterJob(jobId);
  }
}
