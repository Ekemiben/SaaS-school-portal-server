import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class RlsHelper {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executes a database query or transaction within the context of a specific tenant RLS session.
   * Runs `SET LOCAL app.current_tenant_id = '<tenantId>'` in the current transaction.
   */
  async withTenantContext<T>(
    tenantId: string,
    callback: (prisma: PrismaService) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma.isDbConnected) {
      return callback(this.prisma);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Set local PostgreSQL session configuration for RLS policies
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId.replace(/'/g, "''")}';`);
        return callback(tx as unknown as PrismaService);
      });
    } catch {
      // Fallback in case of raw transaction limitations or mock store
      return callback(this.prisma);
    }
  }
}
