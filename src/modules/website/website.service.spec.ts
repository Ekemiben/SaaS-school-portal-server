import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebsiteService } from './website.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

describe('WebsiteService - Color Customization & Theme Resolution', () => {
  let service: WebsiteService;
  let prisma: any;

  const mockTenant1 = {
    id: 'tenant-1',
    name: 'Greenwood Academy',
    slug: 'greenwood',
    logoUrl: 'https://example.com/logo.png',
    faviconUrl: null,
    primaryColor: '#008000',
    secondaryColor: '#D4AF37',
    timezone: 'Africa/Lagos',
    currency: 'NGN',
    websiteConfig: {
      id: 'cfg-1',
      tenantId: 'tenant-1',
      motto: 'Knowledge is Power',
      tagline: 'Leading with excellence',
      colorPalette: [
        { id: 'col_1', name: 'School Green', hex: '#008000' },
        { id: 'col_2', name: 'School Gold', hex: '#D4AF37' },
        { id: 'col_3', name: 'School White', hex: '#FFFFFF' },
      ],
      colorAssignments: {
        landingBackground: 'col_3',
        navbarBg: 'col_3',
        navbarText: 'col_1',
        primaryCtaBg: 'col_2',
        secondaryCtaBg: 'col_1',
        footerBg: 'col_1',
        footerText: 'col_3',
      },
      isPublished: true,
    },
  };

  const mockTenant2 = {
    id: 'tenant-2',
    name: 'St.arlight College',
    slug: 'starlight',
    logoUrl: null,
    faviconUrl: null,
    primaryColor: '#0f172a',
    secondaryColor: '#3b82f6',
    timezone: 'UTC',
    currency: 'USD',
    websiteConfig: null, // Legacy / Unconfigured tenant
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: vi.fn(),
      },
      websiteConfig: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsiteService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WebsiteService>(WebsiteService);
  });

  describe('getPublicConfig', () => {
    it('should throw NotFoundException if tenant does not exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getPublicConfig('unknown-id')).rejects.toThrow(NotFoundException);
    });

    it('should correctly resolve role assignments to referenced palette HEX colors', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant1);

      const result = await service.getPublicConfig('tenant-1');

      expect(result.schoolName).toBe('Greenwood Academy');
      expect(result.colorPalette).toHaveLength(3);
      expect(result.resolvedTheme).toBeDefined();

      // Role assignments mapped to col_3 (#FFFFFF)
      expect(result.resolvedTheme.landingBackground).toBe('#FFFFFF');
      expect(result.resolvedTheme.navbarBg).toBe('#FFFFFF');
      expect(result.resolvedTheme.footerText).toBe('#FFFFFF');

      // Role assignments mapped to col_2 (#D4AF37)
      expect(result.resolvedTheme.primaryCtaBg).toBe('#D4AF37');

      // Role assignments mapped to col_1 (#008000)
      expect(result.resolvedTheme.navbarText).toBe('#008000');
      expect(result.resolvedTheme.secondaryCtaBg).toBe('#008000');
      expect(result.resolvedTheme.footerBg).toBe('#008000');
    });

    it('should provide backward compatibility fallbacks for unconfigured/legacy tenants', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant2);

      const result = await service.getPublicConfig('tenant-2');

      expect(result.schoolName).toBe('St.arlight College');
      expect(result.colorPalette).toEqual([]);
      expect(result.colorAssignments).toEqual({});
      expect(result.resolvedTheme).toBeDefined();

      // Uses tenant.primaryColor (#0f172a) and tenant.secondaryColor (#3b82f6) as fallbacks
      expect(result.resolvedTheme.topBarBg).toBe('#0f172a');
      expect(result.resolvedTheme.primaryCtaBg).toBe('#3b82f6');
      expect(result.resolvedTheme.footerBg).toBe('#0f172a');
      expect(result.resolvedTheme.navbarBg).toBe('#ffffff');
      expect(result.resolvedTheme.landingBackground).toBe('#f8fafc');
    });
  });

  describe('Reusable Color Palette Behavior', () => {
    it('should dynamically update all referencing roles when a palette color hex is updated', async () => {
      // Simulate admin changing School Green (col_1) from #008000 to #006400 (Dark Green)
      const updatedTenant = {
        ...mockTenant1,
        websiteConfig: {
          ...mockTenant1.websiteConfig,
          colorPalette: [
            { id: 'col_1', name: 'School Green', hex: '#006400' }, // changed
            { id: 'col_2', name: 'School Gold', hex: '#D4AF37' },
            { id: 'col_3', name: 'School White', hex: '#FFFFFF' },
          ],
        },
      };
      prisma.tenant.findUnique.mockResolvedValue(updatedTenant);

      const result = await service.getPublicConfig('tenant-1');

      // Every role pointing to col_1 now automatically outputs #006400
      expect(result.resolvedTheme.navbarText).toBe('#006400');
      expect(result.resolvedTheme.secondaryCtaBg).toBe('#006400');
      expect(result.resolvedTheme.footerBg).toBe('#006400');
    });
  });

  describe('Admin Website Config & Tenant Isolation', () => {
    it('should save color palette and assignments via updateAdminConfig', async () => {
      const dto = {
        colorPalette: [
          { id: 'c1', name: 'Royal Blue', hex: '#4169E1' },
        ],
        colorAssignments: {
          primaryCtaBg: 'c1',
        },
      };

      prisma.websiteConfig.upsert.mockResolvedValue({
        id: 'cfg-1',
        tenantId: 'tenant-1',
        ...dto,
        tenant: {
          primaryColor: '#008000',
          secondaryColor: '#D4AF37',
        },
      });

      const result = await service.updateAdminConfig('tenant-1', dto);

      expect(prisma.websiteConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
        }),
      );
      expect(result.resolvedTheme.primaryCtaBg).toBe('#4169E1');
    });

    it('should maintain strict tenant isolation between tenants', async () => {
      prisma.tenant.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'tenant-1') return mockTenant1;
        if (where.id === 'tenant-2') return mockTenant2;
        return null;
      });

      const tenant1Config = await service.getPublicConfig('tenant-1');
      const tenant2Config = await service.getPublicConfig('tenant-2');

      expect(tenant1Config.colorPalette).toHaveLength(3);
      expect(tenant1Config.resolvedTheme.primaryCtaBg).toBe('#D4AF37');

      // Tenant 2 has no custom config, should receive default fallbacks without bleeding from Tenant 1
      expect(tenant2Config.colorPalette).toHaveLength(0);
      expect(tenant2Config.resolvedTheme.primaryCtaBg).toBe('#3b82f6');
    });

    it('should handle unmapped/deleted color references gracefully by falling back to default', async () => {
      const tenantWithDanglingRef = {
        ...mockTenant1,
        websiteConfig: {
          ...mockTenant1.websiteConfig,
          colorPalette: [
            { id: 'col_2', name: 'School Gold', hex: '#D4AF37' }, // col_1 deleted
          ],
          colorAssignments: {
            footerBg: 'col_1', // references deleted color
          },
        },
      };

      prisma.tenant.findUnique.mockResolvedValue(tenantWithDanglingRef);

      const result = await service.getPublicConfig('tenant-1');

      // footerBg falls back cleanly to tenant primaryColor (#008000)
      expect(result.resolvedTheme.footerBg).toBe('#008000');
    });
  });
});
