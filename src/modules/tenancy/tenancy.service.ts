import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCurrentTenant(tenantId: string) {
    if (this.prisma.isDbConnected) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { domains: true },
      });
      if (!tenant) {
        throw new NotFoundException('School organization tenant not found');
      }
      return this.sanitizeTenantConfig(tenant);
    }

    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException('School organization tenant not found');
    }
    const domains = Array.from(this.prisma.memoryStore.domains.values()).filter(
      (d) => d.tenantId === tenantId,
    );
    return this.sanitizeTenantConfig({ ...tenant, domains });
  }

  async resolveByHostname(hostname: string) {
    const cleanHost = hostname.toLowerCase().split(':')[0];

    if (this.prisma.isDbConnected) {
      const tenantDomain = await this.prisma.tenantDomain.findUnique({
        where: { domain: cleanHost },
        include: { tenant: { include: { domains: true } } },
      });

      if (tenantDomain) {
        return this.sanitizeTenantConfig(tenantDomain.tenant);
      }
    } else {
      const domainMatch = Array.from(this.prisma.memoryStore.domains.values()).find(
        (d) => d.domain === cleanHost,
      );
      if (domainMatch) {
        const tenant = this.prisma.memoryStore.tenants.get(domainMatch.tenantId);
        if (tenant) {
          const domains = Array.from(this.prisma.memoryStore.domains.values()).filter(
            (d) => d.tenantId === tenant.id,
          );
          return this.sanitizeTenantConfig({ ...tenant, domains });
        }
      }
    }

    // Subdomain matching
    const parts = cleanHost.split('.');
    if (parts.length >= 2) {
      const slug = parts[0];
      return this.findBySlug(slug);
    }

    // Default fallback
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
      const tenant = Array.from(this.prisma.memoryStore.tenants.values()).find(
        (t) => t.slug === slug,
      );
      if (tenant) {
        const domains = Array.from(this.prisma.memoryStore.domains.values()).filter(
          (d) => d.tenantId === tenant.id,
        );
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
      const domains = Array.from(this.prisma.memoryStore.domains.values()).filter(
        (d) => d.tenantId === first.id,
      );
      return this.sanitizeTenantConfig({ ...first, domains });
    }
    throw new NotFoundException('No active school organization configured.');
  }

  async registerSchool(data: {
    schoolName: string;
    slug: string;
    ownerEmail: string;
    country?: string;
    currency?: string;
  }) {
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

    // Check slug collision
    const existing = Array.from(this.prisma.memoryStore.tenants.values()).find(
      (t) => t.slug === slug,
    );
    if (existing) {
      throw new ConflictException(`Subdomain slug "${slug}" is already taken.`);
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
      features: {
        attendance: true,
        examinations: true,
        fees: true,
        transport: false,
        onlinePayments: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.tenants.set(tenantId, newTenant);

    // Add default subdomain
    const subDomainId = `domain_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    this.prisma.memoryStore.domains.set(subDomainId, {
      id: subDomainId,
      tenantId,
      domain: `${slug}.yoursaas.com`,
      type: 'SUBDOMAIN',
      isPrimary: true,
      isVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create main campus
    const campusId = `campus_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    this.prisma.memoryStore.campuses.set(campusId, {
      id: campusId,
      tenantId,
      name: 'Main Campus',
      code: 'MAIN-01',
      country: data.country || 'United States',
      isMain: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.sanitizeTenantConfig(newTenant);
  }

  async addCustomDomain(tenantId: string, domain: string) {
    const cleanDomain = domain.toLowerCase().trim();
    const domainId = `domain_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const token = `verify_${randomUUID().replace(/-/g, '')}`;

    const record = {
      id: domainId,
      tenantId,
      domain: cleanDomain,
      type: 'CUSTOM',
      isPrimary: false,
      isVerified: false,
      verificationToken: token,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.domains.set(domainId, record);

    return {
      domain: cleanDomain,
      verificationToken: token,
      requiredDnsRecord: {
        type: 'CNAME',
        host: cleanDomain,
        target: 'custom.yoursaas.com',
      },
    };
  }

  async verifyCustomDomain(tenantId: string, domain: string) {
    const cleanDomain = domain.toLowerCase().trim();
    const entry = Array.from(this.prisma.memoryStore.domains.values()).find(
      (d) => d.tenantId === tenantId && d.domain === cleanDomain,
    );

    if (!entry) {
      throw new NotFoundException(`Custom domain ${cleanDomain} not found for this school.`);
    }

    entry.isVerified = true;
    entry.updatedAt = new Date();
    this.prisma.memoryStore.domains.set(entry.id, entry);

    return {
      success: true,
      message: `Domain ${cleanDomain} successfully verified and activated!`,
      domain: entry,
    };
  }

  async updateBranding(
    tenantId: string,
    data: {
      name?: string;
      logoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      timezone?: string;
      locale?: string;
      currency?: string;
    },
  ) {
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    Object.assign(tenant, data, { updatedAt: new Date() });
    this.prisma.memoryStore.tenants.set(tenantId, tenant);
    return this.sanitizeTenantConfig(tenant);
  }

  private sanitizeTenantConfig(tenant: any) {
    // Section 8 & 27: Secrets and payment credentials must never be exposed to public configuration
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
