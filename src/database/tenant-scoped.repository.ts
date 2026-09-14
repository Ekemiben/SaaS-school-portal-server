import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export abstract class TenantScopedRepository {
  constructor(protected readonly prisma: PrismaService) {}

  /**
   * Sanitizes and validates tenant identifier
   */
  protected validateTenantId(tenantId: string): string {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new BadRequestException('Tenant context required: tenantId cannot be null or empty.');
    }
    const trimmed = tenantId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new BadRequestException('Invalid tenant ID format.');
    }
    return trimmed;
  }

  /**
   * Enforces that every tenant-owned query filter strictly includes tenantId.
   */
  protected withTenant<T extends object>(tenantId: string, filter?: T): T & { tenantId: string } {
    const validTenantId = this.validateTenantId(tenantId);
    return {
      ...(filter || ({} as T)),
      tenantId: validTenantId,
    };
  }

  /**
   * Enforces that every tenant mutation payload strictly includes server-resolved tenantId.
   */
  protected withTenantData<T extends object>(tenantId: string, data: T): T & { tenantId: string } {
    const validTenantId = this.validateTenantId(tenantId);
    return {
      ...data,
      tenantId: validTenantId,
    };
  }

  /**
   * Asserts that a retrieved record belongs strictly to the authenticated tenant
   */
  protected assertTenantOwnership(
    expectedTenantId: string,
    recordTenantId: string,
    resourceName: string = 'Resource',
  ): void {
    const validExpected = this.validateTenantId(expectedTenantId);
    if (!recordTenantId || recordTenantId !== validExpected) {
      throw new ForbiddenException(
        `Cross-tenant isolation violation: ${resourceName} does not belong to your school organization.`,
      );
    }
  }
}
