import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export abstract class TenantScopedRepository {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Enforces that every tenant-owned query safely includes tenantId.
   */
  protected withTenant<T extends object>(tenantId: string, filter?: T): T & { tenantId: string } {
    if (!tenantId) {
      throw new Error('Tenant context required: tenantId cannot be null or undefined.');
    }
    return {
      ...(filter || ({} as T)),
      tenantId,
    };
  }
}
