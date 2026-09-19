import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CustomDomainService } from './custom-domain.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TenancyService {
  private readonly logger = new Logger(TenancyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customDomainService: CustomDomainService,
  ) {}

  async resolveCurrentTenant(tenantId: string) {
    if (this.prisma.isDbConnected) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { domains: true },
      });
      if (!tenant) throw new NotFoundException('School organization tenant not found');
      return this.sanitizeTenantConfig(tenant);
    }

    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) throw new NotFoundException('School organization tenant not found');
    const domains = Array.from(this.prisma.memoryStore.domains.values()).filter((d) => d.tenantId === tenantId);
    return this.sanitizeTenantConfig({ ...tenant, domains });
  }

  async resolveByHostname(hostname: string) {
    const cleanHost = hostname.toLowerCase().split(':')[0];

    if (this.prisma.isDbConnected) {
      const tenantDomain = await this.prisma.tenantDomain.findUnique({
        where: { domain: cleanHost },
        include: { tenant: { include: { domains: true } } },
      });

      if (tenantDomain && tenantDomain.isVerified) {
        return this.sanitizeTenantConfig(tenantDomain.tenant);
      }
    } else {
      const domainMatch = Array.from(this.prisma.memoryStore.domains.values()).find(
        (d) => d.domain === cleanHost && d.isVerified,
      );
      if (domainMatch) {
        const tenant = this.prisma.memoryStore.tenants.get(domainMatch.tenantId);
        if (tenant) {
          const domains = Array.from(this.prisma.memoryStore.domains.values()).filter((d) => d.tenantId === tenant.id);
          return this.sanitizeTenantConfig({ ...tenant, domains });
        }
      }
    }

    const parts = cleanHost.split('.');
    if (parts.length >= 2) {
      const slug = parts[0];
      return this.findBySlug(slug);
    }

    return this.getDefaultTenant();
  }

  async findBySlug(slug: string) {
    if (this.prisma.isDbConnected) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        include: { domains: true },
      });
      if (tenant) return this.sanitizeTenantConfig(tenant);
    } else {
      const tenant = Array.from(this.prisma.memoryStore.tenants.values()).find((t) => t.slug === slug);
      if (tenant) {
        const domains = Array.from(this.prisma.memoryStore.domains.values()).filter((d) => d.tenantId === tenant.id);
        return this.sanitizeTenantConfig({ ...tenant, domains });
      }
    }
    return this.getDefaultTenant();
  }

  async getDefaultTenant() {
    if (this.prisma.isDbConnected) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { status: 'ACTIVE' },
        include: { domains: true },
      });
      if (tenant) return this.sanitizeTenantConfig(tenant);
    }

    const first = Array.from(this.prisma.memoryStore.tenants.values())[0];
    if (first) {
      const domains = Array.from(this.prisma.memoryStore.domains.values()).filter((d) => d.tenantId === first.id);
      return this.sanitizeTenantConfig({ ...first, domains });
    }
    throw new NotFoundException('No active school organization configured.');
  }

  listDomains(tenantId: string) {
    return this.customDomainService.listDomains(tenantId);
  }

  addCustomDomain(tenantId: string, domain: string) {
    return this.customDomainService.addCustomDomain(tenantId, domain);
  }

  verifyCustomDomain(tenantId: string, domain: string) {
    return this.customDomainService.verifyCustomDomain(tenantId, domain);
  }

  setPrimaryDomain(tenantId: string, domain: string) {
    return this.customDomainService.setPrimaryDomain(tenantId, domain);
  }

  removeCustomDomain(tenantId: string, domain: string) {
    return this.customDomainService.removeCustomDomain(tenantId, domain);
  }

  async registerSchool(data: { schoolName: string; slug: string; ownerEmail: string; country?: string; currency?: string }) {
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (this.prisma.isDbConnected) {
      const existing = await this.prisma.tenant.findUnique({ where: { slug } });
      if (existing) throw new ConflictException(`Subdomain slug "${slug}" is already taken.`);

      const tenant = await this.prisma.tenant.create({
        data: {
          name: data.schoolName,
          slug,
          currency: data.currency || 'USD',
          status: 'TRIAL',
          plan: 'starter',
          domains: {
            create: {
              domain: `${slug}.yoursaas.com`,
              type: 'SUBDOMAIN',
              isPrimary: true,
              isVerified: true,
              sslStatus: 'ACTIVE',
            },
          },
          campuses: {
            create: {
              name: 'Main Campus',
              code: 'MAIN-01',
              country: data.country || 'United States',
              isMain: true,
            },
          },
        },
        include: { domains: true },
      });

      this.prisma.memoryStore.tenants.set(tenant.id, tenant);
      const subDomainId = `domain_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
      this.prisma.memoryStore.domains.set(subDomainId, {
        id: subDomainId,
        tenantId: tenant.id,
        domain: `${slug}.yoursaas.com`,
        type: 'SUBDOMAIN',
        isPrimary: true,
        isVerified: true,
        sslStatus: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return this.sanitizeTenantConfig(tenant);
    }

    const tenantId = `tenant_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const newTenant = {
      id: tenantId,
      name: data.schoolName,
      slug,
      logoUrl: null,
      faviconUrl: null,
      primaryColor: '#0f172a',
      secondaryColor: '#3b82f6',
      timezone: 'UTC',
      locale: 'en',
      currency: data.currency || 'USD',
      status: 'TRIAL',
      plan: 'starter',
      features: { attendance: true, examinations: true, fees: true, transport: false, onlinePayments: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.tenants.set(tenantId, newTenant);
    const subDomainId = `domain_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    this.prisma.memoryStore.domains.set(subDomainId, {
      id: subDomainId,
      tenantId,
      domain: `${slug}.yoursaas.com`,
      type: 'SUBDOMAIN',
      isPrimary: true,
      isVerified: true,
      sslStatus: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.sanitizeTenantConfig(newTenant);
  }

  async updateBranding(tenantId: string, data: any) {
    if (this.prisma.isDbConnected) {
      const tenant = await this.prisma.tenant.update({
        where: { id: tenantId },
        data,
        include: { domains: true },
      });
      return this.sanitizeTenantConfig(tenant);
    }

    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found');
    Object.assign(tenant, data, { updatedAt: new Date() });
    this.prisma.memoryStore.tenants.set(tenantId, tenant);
    return this.sanitizeTenantConfig(tenant);
  }

  async listPublicSchools() {
    if (this.prisma.isDbConnected) {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        include: {
          domains: true,
          campuses: true,
          _count: { select: { students: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        domain: t.domains?.[0]?.domain || `${t.slug}.yoursaas.com`,
        location: t.campuses?.[0]
          ? [t.campuses[0].city, t.campuses[0].country].filter(Boolean).join(', ') || 'Nigeria'
          : 'Nigeria',
        students: `${t._count?.students || 0} students`,
      }));
    }

    return Array.from(this.prisma.memoryStore.tenants.values()).map((t: any) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      domain: `${t.slug}.yoursaas.com`,
      location: 'Nigeria',
      students: '0 students',
    }));
  }

  private sanitizeTenantConfig(tenant: any) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      faviconUrl: tenant.faviconUrl,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
      timezone: tenant.timezone,
      locale: tenant.locale,
      currency: tenant.currency,
      status: tenant.status,
      features: tenant.features || {},
      domains: tenant.domains || [],
    };
  }
}
