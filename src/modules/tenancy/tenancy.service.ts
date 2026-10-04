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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { domains: true },
    });
    if (!tenant) throw new NotFoundException('School organization tenant not found');
    return this.sanitizeTenantConfig(tenant);
  }

  async resolveByHostname(hostname: string) {
    if (!hostname) return null;
    const cleanHost = hostname.toLowerCase().split(':')[0].trim();

    // Platform root domains - resolve to null (platform context, not a school)
    const platformHosts = ['localhost', '127.0.0.1', '0.0.0.0', 'yourplatform.com', 'www.yourplatform.com', 'saas.local'];
    if (platformHosts.includes(cleanHost)) {
      return null;
    }

    const tenantDomain = await this.prisma.tenantDomain.findUnique({
      where: { domain: cleanHost },
      include: { tenant: { include: { domains: true } } },
    });

    if (tenantDomain && tenantDomain.isVerified) {
      return this.sanitizeTenantConfig(tenantDomain.tenant);
    }

    const parts = cleanHost.split('.');
    if (parts.length >= 2 && (parts.length >= 3 || parts[parts.length - 1] === 'localhost')) {
      const slug = parts[0];
      if (!['www', 'api', 'admin', 'app', 'localhost', 'platform'].includes(slug)) {
        return this.findBySlug(slug);
      }
    }

    // Root domain or unresolvable hostname - return null (never fall back to hardcoded tenants)
    return null;
  }

  async findBySlug(slug: string) {
    if (!slug) return null;
    const cleanSlug = slug.toLowerCase().trim();

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: cleanSlug },
      include: { domains: true },
    });
    if (tenant) return this.sanitizeTenantConfig(tenant);
    return null;
  }

  async getDefaultTenant() {
    return null;
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

  async registerSchool(data: {
    schoolName: string;
    slug: string;
    ownerEmail: string;
    country?: string;
    currency?: string;
    planTier?: string;
    billingCycle?: string;
    paymentOption?: 'pay_now' | 'pay_later';
  }) {
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const targetTier = (data.planTier || 'STARTER').toUpperCase();
    const cycle = (data.billingCycle || 'TERMLY').toUpperCase();
    const isPayNow = data.paymentOption === 'pay_now';

    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Subdomain slug "${slug}" is already taken.`);

    const now = new Date();
    // Approved Architecture: 2-month trial period (60 days)
    const trialEndsAt = new Date(now.getTime() + 60 * 86400000);
    const periodEnd = isPayNow ? new Date(now.getTime() + 90 * 86400000) : trialEndsAt;

    let planRow = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: targetTier },
    });
    if (!planRow) {
      planRow = await this.prisma.subscriptionPlan.findFirst();
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.schoolName,
        slug,
        currency: data.currency || planRow?.currency || 'NGN',
        status: 'TRIAL',
        plan: targetTier.toLowerCase(),
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
            country: data.country || 'Nigeria',
            isMain: true,
          },
        },
      },
      include: { domains: true, campuses: true },
    });

    // Create authoritative PostgreSQL Subscription
    const subId = `sub_${tenant.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const sub = await this.prisma.subscription.create({
      data: {
        id: subId,
        tenantId: tenant.id,
        planId: planRow?.id,
        planTier: targetTier,
        status: isPayNow ? 'PENDING' : 'TRIAL',
        billingCycle: cycle === 'ANNUAL' ? 'ANNUAL' : 'TERMLY',
        priceAtPurchase: planRow ? Number(planRow.termlyPrice) : 150000,
        currency: data.currency || planRow?.currency || 'NGN',
        trialEndsAt: isPayNow ? null : trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        maxStudents: planRow?.maxStudents || 500,
        maxCampuses: planRow?.maxCampuses || 1,
        maxStaff: planRow?.maxStaff || 30,
        storageLimitMb: planRow?.storageLimitMb || 10240,
        autoRenew: true,
      },
    });

    // Bootstrap initial PostgreSQL educational & operational baseline
    await this.bootstrapTenantInitialData(
      tenant.id,
      tenant.name,
      tenant.campuses?.[0]?.id,
      data.ownerEmail,
    );

    return {
      ...this.sanitizeTenantConfig(tenant),
      subscription: sub,
    };
  }

  async updateBranding(tenantId: string, data: any) {
    const existing = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) throw new NotFoundException('Tenant not found');

    const updatePayload: any = {};
    if (data.name) updatePayload.name = data.name;
    if (data.logoUrl !== undefined) updatePayload.logoUrl = data.logoUrl;
    if (data.faviconUrl !== undefined) updatePayload.faviconUrl = data.faviconUrl;
    if (data.primaryColor) updatePayload.primaryColor = data.primaryColor;
    if (data.secondaryColor) updatePayload.secondaryColor = data.secondaryColor;
    if (data.timezone) updatePayload.timezone = data.timezone;
    if (data.locale) updatePayload.locale = data.locale;
    if (data.currency) updatePayload.currency = data.currency;

    if (
      data.features ||
      data.schoolHouses ||
      data.principalSignatureUrl !== undefined ||
      data.schoolStampUrl !== undefined ||
      data.reportCardLayout !== undefined
    ) {
      const existingFeatures = (existing.features as any) || {};
      updatePayload.features = {
        ...existingFeatures,
        ...(data.features || {}),
        ...(data.schoolHouses ? { schoolHouses: data.schoolHouses } : {}),
        ...(data.principalSignatureUrl !== undefined ? { principalSignatureUrl: data.principalSignatureUrl } : {}),
        ...(data.schoolStampUrl !== undefined ? { schoolStampUrl: data.schoolStampUrl } : {}),
        ...(data.reportCardLayout !== undefined ? { reportCardLayout: data.reportCardLayout } : {}),
      };
    }

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: updatePayload,
      include: { domains: true },
    });
    return this.sanitizeTenantConfig(tenant);
  }

  async listPublicSchools() {
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

  private async bootstrapTenantInitialData(
    tenantId: string,
    schoolName: string,
    campusId?: string,
    ownerEmail?: string,
  ) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const startYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
      const endYear = startYear + 1;
      const academicYearName = `${startYear}/${endYear}`;

      // 1. Academic Year & Terms
      let academicYear = await this.prisma.academicYear.findFirst({
        where: { tenantId, name: academicYearName },
      });

      if (!academicYear) {
        academicYear = await this.prisma.academicYear.create({
          data: {
            id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            name: academicYearName,
            startDate: new Date(`${startYear}-09-01T00:00:00.000Z`),
            endDate: new Date(`${endYear}-07-31T23:59:59.000Z`),
            isCurrent: true,
          },
        });

        await this.prisma.term.createMany({
          data: [
            {
              id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              academicYearId: academicYear.id,
              name: 'First Term',
              startDate: new Date(`${startYear}-09-01T00:00:00.000Z`),
              endDate: new Date(`${startYear}-12-18T23:59:59.000Z`),
              isCurrent: true,
            },
            {
              id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              academicYearId: academicYear.id,
              name: 'Second Term',
              startDate: new Date(`${endYear}-01-08T00:00:00.000Z`),
              endDate: new Date(`${endYear}-04-10T23:59:59.000Z`),
              isCurrent: false,
            },
            {
              id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
              tenantId,
              academicYearId: academicYear.id,
              name: 'Third Term',
              startDate: new Date(`${endYear}-04-28T00:00:00.000Z`),
              endDate: new Date(`${endYear}-07-25T23:59:59.000Z`),
              isCurrent: false,
            },
          ],
          skipDuplicates: true,
        });
      }

      // 2. Standard Grading Scales
      const standardGrades = [
        { grade: 'A1', minScore: 75, maxScore: 100, gradePoint: 4.0, description: 'Excellent' },
        { grade: 'B2', minScore: 70, maxScore: 74.99, gradePoint: 3.5, description: 'Very Good' },
        { grade: 'B3', minScore: 65, maxScore: 69.99, gradePoint: 3.0, description: 'Good' },
        { grade: 'C4', minScore: 60, maxScore: 64.99, gradePoint: 2.5, description: 'Credit' },
        { grade: 'C5', minScore: 55, maxScore: 59.99, gradePoint: 2.0, description: 'Credit' },
        { grade: 'C6', minScore: 50, maxScore: 54.99, gradePoint: 1.5, description: 'Credit' },
        { grade: 'D7', minScore: 45, maxScore: 49.99, gradePoint: 1.0, description: 'Pass' },
        { grade: 'E8', minScore: 40, maxScore: 44.99, gradePoint: 0.5, description: 'Pass' },
        { grade: 'F9', minScore: 0, maxScore: 39.99, gradePoint: 0.0, description: 'Fail' },
      ];

      for (const g of standardGrades) {
        await this.prisma.gradingScale.upsert({
          where: {
            tenantId_name_grade: {
              tenantId,
              name: 'Standard WAEC / National Scale',
              grade: g.grade,
            },
          },
          update: {},
          create: {
            id: `gs_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            campusId: campusId || null,
            name: 'Standard WAEC / National Scale',
            grade: g.grade,
            minScore: g.minScore,
            maxScore: g.maxScore,
            gradePoint: g.gradePoint,
            description: g.description,
          },
        });
      }

      // 3. Website Config
      await this.prisma.websiteConfig.upsert({
        where: { tenantId },
        update: {},
        create: {
          id: `web_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId,
          heroTitle: `Welcome to ${schoolName}`,
          heroSubtitle: 'Empowering students for a brighter future through excellence, knowledge, and character.',
          aboutStory: `${schoolName} is committed to providing high-quality educational experiences that inspire curiosity, discipline, and achievement.`,
          contactEmail: ownerEmail || null,
          isPublished: true,
        },
      });

      // 4. Default System Roles
      const systemRoles = [
        { name: 'School Owner', desc: 'Primary owner with full institutional access' },
        { name: 'School Admin', desc: 'School administrative officer' },
        { name: 'TEACHER', desc: 'Academic instructor and subject teacher' },
        { name: 'STUDENT', desc: 'Enrolled student with learner portal access' },
        { name: 'PARENT', desc: 'Parent or Guardian with ward portal access' },
        { name: 'ACCOUNTANT', desc: 'Bursary and finance officer' },
      ];

      const allPermissions = await this.prisma.permission.findMany();
      const schoolPerms = allPermissions.filter((p) => !p.name.startsWith('platform.'));

      for (const r of systemRoles) {
        const role = await this.prisma.role.upsert({
          where: {
            tenantId_name: {
              tenantId,
              name: r.name,
            },
          },
          update: {},
          create: {
            id: `role_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId,
            name: r.name,
            description: r.desc,
            isSystem: true,
          },
        });

        if (['School Owner', 'School Admin'].includes(r.name) && schoolPerms.length > 0) {
          await this.prisma.rolePermission.createMany({
            data: schoolPerms.map((p) => ({ roleId: role.id, permissionId: p.id })),
            skipDuplicates: true,
          });
        }
      }

      this.logger.log(`Successfully bootstrapped initial tenant baseline data for ${tenantId} (${schoolName})`);
    } catch (err: any) {
      this.logger.warn(`Tenant data bootstrapping encountered a non-fatal issue: ${err.message}`);
    }
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
