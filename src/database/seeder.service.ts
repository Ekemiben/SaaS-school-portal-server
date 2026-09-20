import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SystemPermissions } from '../common/constants/permissions.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

@Injectable()
export class DatabaseSeederService {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedSystemPermissions(): Promise<number> {
    if (!this.prisma.isDbConnected) {
      return 0;
    }

    let seededCount = 0;
    for (const [_key, code] of Object.entries(SystemPermissions)) {
      const parts = code.split('.');
      const moduleName = parts[0] || 'general';
      const actionName = parts[1] || 'access';

      try {
        await this.prisma.permission.upsert({
          where: { name: code },
          update: {
            module: moduleName,
            description: `Allows user to ${actionName} within ${moduleName} module`,
          },
          create: {
            name: code,
            module: moduleName,
            description: `Allows user to ${actionName} within ${moduleName} module`,
          },
        });
        seededCount++;
      } catch (err: any) {
        this.logger.warn(`Failed to upsert permission ${code}: ${err?.message}`);
      }
    }

    this.logger.log(`Initialized ${seededCount} system permissions in PostgreSQL.`);
    return seededCount;
  }

  async seedDemoTenant(): Promise<{ success: boolean; tenantId: string; message: string }> {
    if (!this.prisma.isDbConnected) {
      return { success: false, tenantId: '', message: 'Database not connected' };
    }

    const demoTenantId = 'tenant_greenfield_100';
    const demoSlug = 'greenfield';

    // 1. Demo Tenant
    const demoTenant = await this.prisma.tenant.upsert({
      where: { id: demoTenantId },
      update: {
        status: 'ACTIVE',
        name: 'Greenfield International Academy',
        slug: demoSlug,
      },
      create: {
        id: demoTenantId,
        name: 'Greenfield International Academy',
        slug: demoSlug,
        logoUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=200',
        faviconUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=32',
        primaryColor: '#0f172a',
        secondaryColor: '#3b82f6',
        timezone: 'UTC',
        locale: 'en',
        currency: 'USD',
        status: 'ACTIVE',
        plan: 'standard',
      },
    });

    // 2. Demo Subdomain Domain
    await this.prisma.tenantDomain.upsert({
      where: { domain: 'greenfield.yoursaas.com' },
      update: { isVerified: true, isPrimary: true },

      create: {
        tenantId: demoTenant.id,
        domain: 'greenfield.yoursaas.com',
        type: 'SUBDOMAIN',
        isPrimary: true,
        isVerified: true,
      },
    });

    // 3. Main Campus
    const campus = await this.prisma.campus.upsert({
      where: {
        tenantId_code: {
          tenantId: demoTenant.id,
          code: 'CAMPUS-01',
        },
      },
      update: { isMain: true },
      create: {
        id: 'campus_main_01',
        tenantId: demoTenant.id,
        name: 'Main Campus',
        code: 'CAMPUS-01',
        address: '14 Education Boulevard',
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
        phone: '+234 801 234 5678',
        email: 'maincampus@greenfield.edu.ng',
        isMain: true,
      },
    });

    // 4. Admin Role & Permissions
    const adminRole = await this.prisma.role.upsert({
      where: {
        tenantId_name: {
          tenantId: demoTenant.id,
          name: 'ADMIN',
        },
      },
      update: {},
      create: {
        tenantId: demoTenant.id,
        name: 'ADMIN',
        description: 'Greenfield Demo Administrator',
        isSystem: true,
      },
    });

    // 5. Demo Admin User
    const existingUser = await this.prisma.user.findFirst({
      where: { tenantId: demoTenant.id, email: 'admin@greenfield.edu.ng' },
    });
    let adminUser = existingUser;
    if (!adminUser) {
      const passwordHash = await bcrypt.hash('DemoAdmin123!', 10);
      adminUser = await this.prisma.user.create({
        data: {
          id: 'user_greenfield_admin_001',
          tenantId: demoTenant.id,
          email: 'admin@greenfield.edu.ng',
          passwordHash,
          firstName: 'Greenfield',
          lastName: 'Administrator',
          isActive: true,
        },
      });
      await this.prisma.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
        },
      });
    }

    // 6. Academic Year & Terms
    const yr = new Date().getFullYear();
    let academicYear = await this.prisma.academicYear.findFirst({
      where: { tenantId: demoTenant.id, isCurrent: true },
    });
    if (!academicYear) {
      academicYear = await this.prisma.academicYear.create({
        data: {
          id: `ay_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
          tenantId: demoTenant.id,
          name: `${yr}/${yr + 1}`,
          startDate: new Date(`${yr}-09-01`),
          endDate: new Date(`${yr + 1}-07-31`),
          isCurrent: true,
        },
      });

      await this.prisma.term.createMany({
        data: [
          {
            id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            academicYearId: academicYear.id,
            name: 'First Term',
            startDate: new Date(`${yr}-09-01`),
            endDate: new Date(`${yr}-12-15`),
            isCurrent: true,
          },
          {
            id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            academicYearId: academicYear.id,
            name: 'Second Term',
            startDate: new Date(`${yr + 1}-01-10`),
            endDate: new Date(`${yr + 1}-04-05`),
            isCurrent: false,
          },
          {
            id: `term_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            academicYearId: academicYear.id,
            name: 'Third Term',
            startDate: new Date(`${yr + 1}-04-25`),
            endDate: new Date(`${yr + 1}-07-20`),
            isCurrent: false,
          },
        ],
      });
    }

    // 7. Classes
    const existingClasses = await this.prisma.class.findMany({ where: { tenantId: demoTenant.id } });
    if (existingClasses.length === 0) {
      const defaultClasses = [
        { name: 'JSS 1', gradeLevel: 'Junior Secondary 1' },
        { name: 'JSS 2', gradeLevel: 'Junior Secondary 2' },
        { name: 'JSS 3', gradeLevel: 'Junior Secondary 3' },
        { name: 'SSS 1', gradeLevel: 'Senior Secondary 1' },
        { name: 'SSS 2', gradeLevel: 'Senior Secondary 2' },
        { name: 'SSS 3', gradeLevel: 'Senior Secondary 3' },
      ];
      for (const cls of defaultClasses) {
        await this.prisma.class.create({
          data: {
            id: `cls_${randomUUID().replace(/-/g, '').substring(0, 12)}`,
            tenantId: demoTenant.id,
            campusId: campus.id,
            academicYearId: academicYear.id,
            name: cls.name,
            gradeLevel: cls.gradeLevel,
            capacity: 40,
          },
        });
      }
    }

    // 8. Website Config
    await this.prisma.websiteConfig.upsert({
      where: { tenantId: demoTenant.id },
      update: {
        heroTitle: 'Welcome to Greenfield International Academy',
        isPublished: true,
      },
      create: {
        tenantId: demoTenant.id,
        heroTitle: 'Welcome to Greenfield International Academy',
        heroSubtitle: 'Nurturing Future Leaders with Academic Excellence & Integrity',
        aboutStory: 'Greenfield International Academy is a premier co-educational institution.',
        contactEmail: 'info@greenfield.edu.ng',
        contactPhone: '+234 801 234 5678',
        isPublished: true,
      },
    });

    this.logger.log(`Seeded demo tenant: ${demoTenant.name} (${demoTenant.id}) with complete isolated data.`);
    return {
      success: true,
      tenantId: demoTenant.id,
      message: 'Demo tenant Greenfield seeded successfully.',
    };
  }
}

