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

  private createTenantScopedStore(tenantId: string, memoryStore: any) {
    const handler: ProxyHandler<any> = {
      get: (targetStore, prop: string) => {
        const actualMap = targetStore[prop];
        if (!(actualMap instanceof Map)) {
          return actualMap;
        }

        const isTenantMap = prop === 'tenants';

        return {
          get: (id: string) => {
            const item = actualMap.get(id);
            if (!item) return undefined;
            if (isTenantMap) {
              return item.id === tenantId ? item : undefined;
            }
            return item.tenantId === tenantId ? item : undefined;
          },
          has: (id: string) => {
            const item = actualMap.get(id);
            if (!item) return false;
            if (isTenantMap) {
              return item.id === tenantId;
            }
            return item.tenantId === tenantId;
          },
          values: () => {
            const all = Array.from(actualMap.values());
            if (isTenantMap) {
              return all.filter((item: any) => item.id === tenantId);
            }
            return all.filter((item: any) => item.tenantId === tenantId);
          },
          entries: () => {
            const all = Array.from(actualMap.entries());
            if (isTenantMap) {
              return all.filter(([_, item]: any) => item.id === tenantId);
            }
            return all.filter(([_, item]: any) => item.tenantId === tenantId);
          },
          set: (id: string, value: any) => {
            if (value && value.tenantId && value.tenantId !== tenantId) {
              throw new ForbiddenException(`Cross-tenant mutation prohibited: Resource tagged with foreign tenantId ${value.tenantId}`);
            }
            const existing = actualMap.get(id);
            if (existing && existing.tenantId && existing.tenantId !== tenantId) {
              throw new ForbiddenException(`Cross-tenant update prohibited on foreign record ${id}`);
            }
            return actualMap.set(id, { ...value, tenantId: value.tenantId || tenantId });
          },
          delete: (id: string) => {
            const existing = actualMap.get(id);
            if (!existing) return false;
            if (isTenantMap && existing.id !== tenantId) {
              throw new ForbiddenException('Cannot delete foreign tenant');
            }
            if (!isTenantMap && existing.tenantId && existing.tenantId !== tenantId) {
              throw new ForbiddenException('Cannot delete foreign tenant record');
            }
            return actualMap.delete(id);
          },
        };
      },
    };

    return new Proxy(memoryStore, handler);
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

    if (!this.prisma.isDbConnected) {
      const scopedStore = this.createTenantScopedStore(validTenantId, this.prisma.memoryStore);
      const scopedPrisma = new Proxy(this.prisma, {
        get: (target, prop) => {
          if (prop === 'memoryStore') return scopedStore;
          return (target as any)[prop];
        },
      });
      return callback(scopedPrisma as unknown as PrismaService);
    }

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
    if (!this.prisma.isDbConnected) {
      return callback(this.prisma);
    }

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
