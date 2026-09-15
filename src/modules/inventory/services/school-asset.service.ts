import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateSchoolAssetDto,
  UpdateSchoolAssetDto,
} from '../dto/school-asset.dto.js';
import { SchoolAssetFilterDto } from '../dto/inventory-filter.dto.js';

@Injectable()
export class SchoolAssetService {
  private readonly logger = new Logger(SchoolAssetService.name);

  constructor(private readonly prisma: PrismaService) {}

  enrichAsset(a: any) {
    const qty = Number(a.qty ?? a.quantity ?? 1);
    const unitCost = Number(a.unitCost ?? a.purchaseCost ?? 0);
    return {
      ...a,
      item: a.item || a.name || 'Asset',
      name: a.name || a.item || 'Asset',
      qty,
      quantity: qty,
      unitCost,
      purchaseCost: unitCost,
      custodian: a.custodian || 'Estate Department',
      location: a.location || 'Main Campus',
      condition: a.condition || 'Good',
      status: a.status === 'IN_SERVICE' ? 'In Use' : (a.status || 'In Use'),
      lastAudited: a.lastAudited || (a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : '2025-09-01'),
    };
  }

  async createAsset(
    tenantId: string,
    campusId: string | undefined,
    dto: CreateSchoolAssetDto,
  ) {
    const targetCampusId = dto.campusId || campusId || null;
    const resolvedTag = (dto.assetTag || `AST-${Math.floor(100 + Math.random() * 900)}`).toUpperCase();

    const existingTag = Array.from(
      this.prisma.memoryStore.schoolAssets.values(),
    ).find(
      (a: any) =>
        a.tenantId === tenantId &&
        a.assetTag.toLowerCase() === resolvedTag.toLowerCase(),
    );

    if (existingTag && dto.assetTag) {
      throw new BadRequestException(
        `School asset with tag '${dto.assetTag}' already exists`,
      );
    }

    if (dto.vendorId) {
      const vendor = this.prisma.memoryStore.vendors.get(dto.vendorId);
      if (!vendor || vendor.tenantId !== tenantId) {
        throw new NotFoundException(`Vendor with ID '${dto.vendorId}' not found`);
      }
    }

    const id = `AST-00${this.prisma.memoryStore.schoolAssets.size + 1}`;
    const name = dto.name || (dto as any).item || 'School Asset';
    const unitCost = Number((dto as any).unitCost || dto.purchaseCost || 0.0);
    const purchaseCost = unitCost;
    const qty = Number((dto as any).qty || (dto as any).quantity || 1);
    const salvageValue = Number(dto.salvageValue) || 0.0;
    const usefulLifeYears = Number(dto.usefulLifeYears) || 5;

    const asset = {
      id,
      tenantId,
      campusId: targetCampusId,
      name,
      item: name,
      assetTag: resolvedTag,
      category: dto.category || 'Classroom Furniture',
      serialNumber: dto.serialNumber || null,
      model: dto.model || null,
      manufacturer: dto.manufacturer || null,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
      purchaseCost,
      unitCost,
      qty,
      quantity: qty,
      vendorId: dto.vendorId || null,
      warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
      usefulLifeYears,
      salvageValue,
      depreciationMethod: dto.depreciationMethod || 'STRAIGHT_LINE',
      currentBookValue: purchaseCost,
      accumulatedDepreciation: 0.0,
      lastDepreciationDate: null,
      location: dto.location || 'Main Campus Block A',
      assignedToStaffId: dto.assignedToStaffId || null,
      custodian: (dto as any).custodian || 'Estate Department',
      condition: dto.condition || 'Good',
      status: 'In Use',
      lastAudited: new Date().toISOString().split('T')[0],
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.schoolAssets.set(id, asset);
    return this.enrichAsset(asset);
  }

  async updateAsset(tenantId: string, assetId: string, dto: UpdateSchoolAssetDto) {
    const asset = await this.getAssetById(tenantId, assetId);

    const newQty = (dto as any).qty !== undefined
      ? Number((dto as any).qty)
      : ((dto as any).quantity !== undefined ? Number((dto as any).quantity) : asset.qty);

    const updated = {
      ...asset,
      ...dto,
      qty: newQty,
      quantity: newQty,
      lastAudited: new Date().toISOString().split('T')[0],
      warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : asset.warrantyExpiry,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.schoolAssets.set(assetId, updated);
    return this.enrichAsset(updated);
  }

  async getAssetById(tenantId: string, assetId: string) {
    const asset = this.prisma.memoryStore.schoolAssets.get(assetId);
    if (!asset || asset.tenantId !== tenantId) {
      throw new NotFoundException(`School asset with ID '${assetId}' not found`);
    }

    // Attach vendor details if present
    let vendor = null;
    if (asset.vendorId) {
      vendor = this.prisma.memoryStore.vendors.get(asset.vendorId) || null;
    }

    const maintenanceLogs = Array.from(
      this.prisma.memoryStore.assetMaintenanceLogs.values(),
    ).filter((m: any) => m.assetId === assetId && m.tenantId === tenantId);

    const depreciationSchedules = Array.from(
      this.prisma.memoryStore.assetDepreciationSchedules.values(),
    ).filter((s: any) => s.assetId === assetId && s.tenantId === tenantId);

    return {
      ...asset,
      vendor,
      maintenanceLogsCount: maintenanceLogs.length,
      depreciationSchedulesCount: depreciationSchedules.length,
    };
  }

  async findAllAssets(tenantId: string, filter?: SchoolAssetFilterDto) {
    let list = Array.from(this.prisma.memoryStore.schoolAssets.values()).filter(
      (a: any) => a.tenantId === tenantId,
    );

    if (filter?.campusId) {
      list = list.filter((a: any) => a.campusId === filter.campusId || a.campusId === null);
    }
    if (filter?.category) {
      list = list.filter((a: any) => a.category === filter.category);
    }
    if (filter?.condition) {
      list = list.filter((a: any) => a.condition === filter.condition);
    }
    if (filter?.status) {
      list = list.filter((a: any) => a.status === filter.status);
    }
    if (filter?.location) {
      list = list.filter((a: any) => a.location?.toLowerCase().includes(filter.location!.toLowerCase()));
    }
    if (filter?.assignedToStaffId) {
      list = list.filter((a: any) => a.assignedToStaffId === filter.assignedToStaffId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (a: any) =>
          a.name.toLowerCase().includes(q) ||
          a.assetTag.toLowerCase().includes(q) ||
          (a.serialNumber && a.serialNumber.toLowerCase().includes(q)) ||
          (a.location && a.location.toLowerCase().includes(q)),
      );
    }

    return list
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a: any) => this.enrichAsset(a));
  }

  async deleteAsset(tenantId: string, assetId: string) {
    const asset = await this.getAssetById(tenantId, assetId);
    this.prisma.memoryStore.schoolAssets.delete(assetId);
    return { success: true, message: `Asset ${asset.assetTag} deleted successfully` };
  }
}
