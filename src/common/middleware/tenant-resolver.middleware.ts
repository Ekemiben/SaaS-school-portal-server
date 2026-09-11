import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service.js';
import { TenantContext } from '../types/tenant-context.interface.js';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const reqAny = req as any;
    const requestId = reqAny.requestId || 'req_unknown';

    // Check headers first (e.g. for API clients, tests, or proxy headers)
    const headerTenantId = req.headers['x-tenant-id'] as string;
    const headerTenantSlug = req.headers['x-tenant-slug'] as string;
    const headerTenantDomain = req.headers['x-tenant-domain'] as string;

    // Check hostname
    const host = (headerTenantDomain || req.headers.host || '').split(':')[0].toLowerCase();

    let tenant: any = null;

    if (headerTenantId) {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: headerTenantId },
        include: { domains: true },
      });
    } else if (headerTenantSlug) {
      tenant = await this.prisma.tenant.findUnique({
        where: { slug: headerTenantSlug },
        include: { domains: true },
      });
    } else if (host && host !== 'localhost' && host !== '127.0.0.1') {
      // 1. Check custom or platform subdomain domain table
      const tenantDomain = await this.prisma.tenantDomain.findUnique({
        where: { domain: host },
        include: { tenant: true },
      });

      if (tenantDomain) {
        tenant = tenantDomain.tenant;
      } else {
        // 2. Check if subdomain match (e.g. greenfield.yoursaas.com or greenfield.schoolportal.com)
        const parts = host.split('.');
        if (parts.length >= 3) {
          const sub = parts[0];
          tenant = await this.prisma.tenant.findUnique({
            where: { slug: sub },
          });
        }
      }
    }

    // Default development / test tenant fallback if none found
    if (!tenant) {
      tenant = await this.prisma.tenant.findFirst({
        where: { status: 'ACTIVE' },
      });
    }

    if (tenant) {
      if (tenant.status === 'SUSPENDED' || tenant.status === 'DELETED') {
        throw new HttpException(
          {
            success: false,
            error: {
              code: ErrorCodes.TENANT_SUSPENDED,
              message: 'This school portal tenant has been suspended or deactivated.',
            },
            requestId,
          },
          HttpStatus.FORBIDDEN,
        );
      }

      const tenantContext: TenantContext = {
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        features: typeof tenant.features === 'object' ? tenant.features : {},
        requestId,
      };

      reqAny.tenantContext = tenantContext;
    }

    next();
  }
}
