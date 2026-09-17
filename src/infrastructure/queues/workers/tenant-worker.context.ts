import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { RlsHelper } from '../../../database/rls.helper.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { JobEnvelope } from '../contracts/job-envelope.interface.js';
import { JobResult } from '../contracts/job-result.interface.js';

@Injectable()
export class TenantWorkerContext {
  private readonly logger = new Logger(TenantWorkerContext.name);

  constructor(
    private readonly rlsHelper: RlsHelper,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Executes background job processing inside the tenant-isolated RLS transaction session.
   * Enforces SET LOCAL app.current_tenant_id = '<tenantId>' for all database interactions.
   */
  async runWithTenantContext<TData = any, TResult = any>(
    envelope: JobEnvelope<TData>,
    handler: (data: TData, tx: PrismaService) => Promise<TResult>,
  ): Promise<JobResult<TResult>> {
    const startTime = Date.now();
    const { id, name, queueName, tenantId, data } = envelope;

    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      this.logger.error(`Fatal: Background job [${name}] #${id} missing valid tenantId.`);
      throw new BadRequestException(`Security violation: Job [${id}] requires tenantId context.`);
    }

    this.logger.log(`[Worker] Starting job [${name}] #${id} on queue "${queueName}" for tenant "${tenantId}"`);

    try {
      const result = await this.rlsHelper.withTenantContext(tenantId, async (tx) => {
        return handler(data, tx);
      });

      const duration = Date.now() - startTime;
      this.logger.log(`[Worker] Job [${name}] #${id} completed successfully in ${duration}ms`);

      return {
        success: true,
        jobId: id,
        queueName,
        tenantId,
        result,
        executionDurationMs: duration,
        completedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `[Worker] Job [${name}] #${id} failed for tenant "${tenantId}" in ${duration}ms: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        jobId: id,
        queueName,
        tenantId,
        error: error.message,
        executionDurationMs: duration,
        completedAt: new Date().toISOString(),
      };
    }
  }
}
