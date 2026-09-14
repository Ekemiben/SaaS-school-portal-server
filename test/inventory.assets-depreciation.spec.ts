import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { SchoolAssetService } from '../src/modules/inventory/services/school-asset.service.js';
import { AssetDepreciationService } from '../src/modules/inventory/services/asset-depreciation.service.js';
import { AssetMaintenanceService } from '../src/modules/inventory/services/asset-maintenance.service.js';
import { VendorService } from '../src/modules/inventory/services/vendor.service.js';

describe('School Assets, Maintenance & Depreciation Engine', () => {
  let prisma: PrismaService;
  let assetService: SchoolAssetService;
  let depreciationService: AssetDepreciationService;
  let maintenanceService: AssetMaintenanceService;
  let vendorService: VendorService;

  const tenantId = 'tenant_greenfield_100';
  const campusId = 'campus_main_01';
  const userId = 'user_admin_001';

  beforeEach(() => {
    prisma = new PrismaService();
    assetService = new SchoolAssetService(prisma);
    depreciationService = new AssetDepreciationService(prisma);
    maintenanceService = new AssetMaintenanceService(prisma);
    vendorService = new VendorService(prisma);
  });

  it('should register school fixed assets and prevent duplicate asset tags', async () => {
    // 1. Create supplier vendor
    const vendor = await vendorService.createVendor(tenantId, {
      name: 'LabTech Scientific Solutions',
      code: 'LABTECH-01',
      category: 'EQUIPMENT',
      paymentTerms: 'NET_30',
    });

    // 2. Register Lab Equipment Asset
    const microscope = await assetService.createAsset(tenantId, campusId, {
      name: 'Binocular Compound Microscope Olympus CX23',
      assetTag: 'AST-LAB-MIC-001',
      category: 'LAB_EQUIPMENT',
      model: 'Olympus CX23',
      manufacturer: 'Olympus',
      purchaseCost: 1200.0,
      vendorId: vendor.id,
      usefulLifeYears: 5,
      salvageValue: 200.0,
      depreciationMethod: 'STRAIGHT_LINE',
      location: 'Biology Lab 1 / Cabinet A',
      condition: 'EXCELLENT',
    });

    expect(microscope.id).toBeDefined();
    expect(microscope.assetTag).toBe('AST-LAB-MIC-001');
    expect(microscope.currentBookValue).toBe(1200.0);
    expect(microscope.accumulatedDepreciation).toBe(0.0);

    // 3. Duplicate asset tag should fail
    await expect(
      assetService.createAsset(tenantId, campusId, {
        name: 'Another Microscope',
        assetTag: 'AST-LAB-MIC-001',
        purchaseCost: 1100.0,
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it('should calculate Straight-Line and Reducing-Balance depreciation accurately', async () => {
    // 1. Create asset with Straight Line method: Cost = 1000, Salvage = 100, Useful Life = 3 years
    // Annual Depreciation = (1000 - 100) / 3 = 300
    const assetSL = await assetService.createAsset(tenantId, campusId, {
      name: 'Interactive Smart Board 75-inch',
      assetTag: 'AST-ICT-SBD-01',
      category: 'ICT_HARDWARE',
      purchaseCost: 1000.0,
      usefulLifeYears: 3,
      salvageValue: 100.0,
      depreciationMethod: 'STRAIGHT_LINE',
    });

    // Run Year 1 Annual Depreciation
    const scheduleY1 = await depreciationService.calculateAssetDepreciation(
      tenantId,
      assetSL.id,
      '2026-2027',
      'ANNUAL',
      userId,
    );

    expect(scheduleY1.depreciationAmount).toBe(300.0);
    expect(scheduleY1.beginningBookValue).toBe(1000.0);
    expect(scheduleY1.endingBookValue).toBe(700.0);

    const assetAfterY1 = await assetService.getAssetById(tenantId, assetSL.id);
    expect(assetAfterY1.currentBookValue).toBe(700.0);
    expect(assetAfterY1.accumulatedDepreciation).toBe(300.0);

    // Run Year 2 Annual Depreciation
    const scheduleY2 = await depreciationService.calculateAssetDepreciation(
      tenantId,
      assetSL.id,
      '2027-2028',
      'ANNUAL',
      userId,
    );
    expect(scheduleY2.depreciationAmount).toBe(300.0);
    expect(scheduleY2.endingBookValue).toBe(400.0);

    // 2. Create asset with Reducing Balance method: Cost = 2000, Useful Life = 4 years, Salvage = 100
    // Double Declining Rate = 2 / 4 = 0.5 (50%)
    const assetRB = await assetService.createAsset(tenantId, campusId, {
      name: 'Dell Server PowerEdge R740',
      assetTag: 'AST-ICT-SRV-01',
      category: 'ICT_HARDWARE',
      purchaseCost: 2000.0,
      usefulLifeYears: 4,
      salvageValue: 100.0,
      depreciationMethod: 'REDUCING_BALANCE',
    });

    const scheduleRB1 = await depreciationService.calculateAssetDepreciation(
      tenantId,
      assetRB.id,
      '2026-2027',
      'ANNUAL',
      userId,
    );
    expect(scheduleRB1.depreciationAmount).toBe(1000.0); // 50% of 2000
    expect(scheduleRB1.endingBookValue).toBe(1000.0);

    const assetRBAfterY1 = await assetService.getAssetById(tenantId, assetRB.id);
    expect(assetRBAfterY1.currentBookValue).toBe(1000.0);
  });

  it('should log routine maintenance, repairs and update asset status and condition', async () => {
    // 1. Create School Van Asset
    const schoolBus = await assetService.createAsset(tenantId, campusId, {
      name: 'Toyota Coaster 32-Seater Bus',
      assetTag: 'AST-VEH-BUS-01',
      category: 'VEHICLES',
      purchaseCost: 45000.0,
      condition: 'GOOD',
    });

    // 2. Schedule maintenance
    const log = await maintenanceService.createMaintenanceLog(tenantId, {
      assetId: schoolBus.id,
      maintenanceType: 'ROUTINE_SERVICE',
      description: '50,000 km general servicing and brake pad replacement',
      cost: 450.0,
      status: 'SCHEDULED',
    });

    expect(log.id).toBeDefined();
    const assetInMaintenance = await assetService.getAssetById(tenantId, schoolBus.id);
    expect(assetInMaintenance.status).toBe('UNDER_MAINTENANCE');

    // 3. Complete maintenance
    const completedLog = await maintenanceService.updateMaintenanceLog(tenantId, log.id, {
      status: 'COMPLETED',
      findings: 'Replaced front brake pads and oil filter. Engine running optimally.',
      nextServiceDue: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
    });

    expect(completedLog.status).toBe('COMPLETED');
    const assetRestored = await assetService.getAssetById(tenantId, schoolBus.id);
    expect(assetRestored.status).toBe('IN_SERVICE');
    expect(assetRestored.condition).toBe('GOOD');
  });
});
