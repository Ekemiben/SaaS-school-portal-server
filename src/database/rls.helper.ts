import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class RlsHelper {
  private readonly logger = new Logger(RlsHelper.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates tenant ID format to prevent SQL injection and malformed identifiers.
   */
  validateTenantId(tenantId: string): string {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new BadRequestException('Tenant ID cannot be empty or whitespace.');
    }

    const trimmed = tenantId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new BadRequestException(
        `Invalid tenant ID format "${tenantId}". Must only contain alphanumeric characters, underscores, and dashes.`,
      );
    }

    return trimmed;
  }

  /**
   * Asserts that a resource belongs to the expected tenant context.
   */
  assertTenantOwnership(
    expectedTenantId: string,
    actualTenantId: string,
    resourceName = 'Resource',
  ): void {
    if (!expectedTenantId || !actualTenantId || expectedTenantId !== actualTenantId) {
      throw new ForbiddenException(
        `Cross-tenant access violation: ${resourceName} does not belong to the authenticated tenant.`,
      );
    }
  }

  /**
   * Executes a database query or transaction within the context of a specific tenant RLS session.
   * Switches to application role and sets `SET LOCAL app.current_tenant_id = '<tenantId>'`.
   */
  async withTenantContext<T>(
    tenantId: string,
    callback: (tx: PrismaService) => Promise<T>,
  ): Promise<T> {
    const validTenantId = this.validateTenantId(tenantId);
    const sanitizedTenantId = validTenantId.replace(/'/g, "''");

    return this.prisma.$transaction(async (tx: any) => {
      if (typeof tx.$executeRawUnsafe === 'function') {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE school_saas_app;`);
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${sanitizedTenantId}';`);
      } else if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SET LOCAL ROLE school_saas_app;`;
      }
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
    return this.prisma.$transaction(async (tx: any) => {
      if (typeof tx.$executeRawUnsafe === 'function') {
        await tx.$executeRawUnsafe(`SET LOCAL app.bypass_rls = 'on';`);
      } else if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SET LOCAL app.bypass_rls = 'on';`;
      }
      return callback(tx as unknown as PrismaService);
    });
  }
}
