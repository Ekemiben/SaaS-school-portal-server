import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class RlsHelper {
  private readonly logger = new Logger(RlsHelper.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sanitizes and validates tenant identifier to prevent SQL injection or malformed input
   */
  public validateTenantId(tenantId: string): string {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new BadRequestException('Invalid tenant ID: A valid non-empty string tenantId is required.');
    }
    const trimmed = tenantId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new BadRequestException('Security violation: Malformed tenant ID contains invalid characters.');
    }
    return trimmed;
  }

  /**
   * Asserts that a given entity strictly belongs to the requesting tenant
   */
  public assertTenantOwnership(
    expectedTenantId: string,
    entityTenantId: string,
    entityName: string = 'Resource',
  ): void {
    const validExpected = this.validateTenantId(expectedTenantId);
    if (!entityTenantId || entityTenantId !== validExpected) {
      throw new ForbiddenException(
        `Cross-tenant access violation: ${entityName} does not belong to your school organization.`,
      );
    }
  }

  /**
   * Executes a database operation within a transaction-local tenant context.
   * On PostgreSQL: executes `SET LOCAL app.current_tenant_id = '<tenantId>'`.
   * On In-Memory Fallback: wraps memory stores with strict tenant isolation proxies.
   */
  async withTenantContext<T>(
    tenantId: string,
    callback: (prisma: PrismaService) => Promise<T>,
  ): Promise<T> {
    const validTenantId = this.validateTenantId(tenantId);

    if (this.prisma.isDbConnected) {
      return this.prisma.$transaction(async (tx) => {
        // Safe parameterization using PostgreSQL set_config with transaction-local scope (is_local = true)
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${validTenantId}, true);`;
        return callback(tx as unknown as PrismaService);
      });
    }

    // In-memory fallback: create tenant-scoped proxy enforcing strict cross-tenant isolation
    const scopedPrisma = this.createScopedMemoryStoreProxy(validTenantId);
    return callback(scopedPrisma);
  }

  /**
   * Wraps the in-memory fallback store with strict tenant filtering and mutation guards
   */
  private createScopedMemoryStoreProxy(tenantId: string): PrismaService {
    const sourcePrisma = this.prisma;
    const scopedMemoryStore: Record<string, Map<string, any>> = {};

    for (const [storeKey, originalMap] of Object.entries(sourcePrisma.memoryStore)) {
      scopedMemoryStore[storeKey] = new Proxy(originalMap, {
        get(target, prop, receiver) {
          if (prop === 'get') {
            return (key: string) => {
              const item = target.get(key);
              if (!item) return undefined;
              if ('tenantId' in item && item.tenantId !== tenantId) {
                // Cross-tenant item is invisible under RLS
                return undefined;
              }
              return item;
            };
          }
          if (prop === 'has') {
            return (key: string) => {
              const item = target.get(key);
              if (!item) return false;
              if ('tenantId' in item && item.tenantId !== tenantId) {
                return false;
              }
              return true;
            };
          }
          if (prop === 'set') {
            return (key: string, value: any) => {
              if (value && typeof value === 'object' && 'tenantId' in value) {
                if (value.tenantId !== tenantId) {
                  throw new ForbiddenException(
                    `Cross-tenant write denied: Cannot insert/update entity for foreign tenant "${value.tenantId}".`,
                  );
                }
              }
              return target.set(key, value);
            };
          }
          if (prop === 'delete') {
            return (key: string) => {
              const item = target.get(key);
              if (!item) return false;
              if ('tenantId' in item && item.tenantId !== tenantId) {
                throw new ForbiddenException(
                  `Cross-tenant delete denied: Cannot delete entity belonging to foreign tenant "${item.tenantId}".`,
                );
              }
              return target.delete(key);
            };
          }
          if (prop === 'values') {
            return function* () {
              for (const item of target.values()) {
                if (!item || !('tenantId' in item) || item.tenantId === tenantId) {
                  yield item;
                }
              }
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    }

    // Return a shallow proxy of PrismaService substituting memoryStore
    return new Proxy(sourcePrisma, {
      get(target, prop, receiver) {
        if (prop === 'memoryStore') {
          return scopedMemoryStore;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
}
