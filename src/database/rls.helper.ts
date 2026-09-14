import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class RlsHelper {
  private readonly logger = new Logger(RlsHelper.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a database query or transaction within the context of a specific tenant RLS session.
   * Switches to application role and sets `SET LOCAL app.current_tenant_id = '<tenantId>'`.
   */
  async withTenantContext<T>(
    tenantId: string,
    callback: (tx: PrismaService) => Promise<T>,
  ): Promise<T> {
    if (!tenantId) {
      throw new Error('Tenant context is required: tenantId cannot be null or undefined.');
    }

    if (!this.prisma.isDbConnected) {
      return callback(this.prisma);
    }

    const sanitizedTenantId = tenantId.replace(/'/g, "''");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE school_saas_app;`);
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${sanitizedTenantId}';`);
      return callback(tx as unknown as PrismaService);
    });
  }

  /**
   * Executes database operations bypassing tenant RLS (used strictly for platform administrative actions).
   * Sets `SET LOCAL app.bypass_rls = 'on'` in the transaction.
   */
  async withBypassContext<T>(
    callback: (tx: PrismaService) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma.isDbConnected) {
      return callback(this.prisma);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on';`);
      return callback(tx as unknown as PrismaService);
    });
  }
}
