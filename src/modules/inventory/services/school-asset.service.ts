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

  async createAsset(
    tenantId: string,
    campusId: string | undefined,
    dto: CreateSchoolAssetDto,
  ) {
    const targetCampusId = dto.campusId || campusId || null;

    const existingTag = Array.from(
      this.prisma.memoryStore.schoolAssets.values(),
    ).find(
      (a: any) =>
        a.tenantId === tenantId &&
        a.assetTag.toLowerCase() === dto.assetTag.toLowerCase(),
    );

    if (existingTag) {
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

    const id = `ast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const purchaseCost = Number(dto.purchaseCost) || 0.0;
    const salvageValue = Number(dto.salvageValue) || 0.0;
    const usefulLifeYears = Number(dto.usefulLifeYears) || 5;

    const asset = {
      id,
      tenantId,
      campusId: targetCampusId,
      name: dto.name,
      assetTag: dto.assetTag.toUpperCase(),
      category: dto.category || 'FURNITURE',
      serialNumber: dto.serialNumber || null,
      model: dto.model || null,
      manufacturer: dto.manufacturer || null,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
      purchaseCost,
      vendorId: dto.vendorId || null,
      warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
      usefulLifeYears,
      salvageValue,
      depreciationMethod: dto.depreciationMethod || 'STRAIGHT_LINE',
      currentBookValue: purchaseCost,
      accumulatedDepreciation: 0.0,
      lastDepreciationDate: null,
      location: dto.location || null,
      assignedToStaffId: dto.assignedToStaffId || null,
      condition: dto.condition || 'GOOD',
      status: 'IN_SERVICE',
      notes: dto.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.schoolAssets.set(id, asset);
    return asset;
  }

  async updateAsset(tenantId: string, assetId: string, dto: UpdateSchoolAssetDto) {
    const asset = await this.getAssetById(tenantId, assetId);

    const updated = {
      ...asset,
      ...dto,
      warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : asset.warrantyExpiry,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.schoolAssets.set(assetId, updated);
    return updated;
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

    return list.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteAsset(tenantId: string, assetId: string) {
    const asset = await this.getAssetById(tenantId, assetId);
    this.prisma.memoryStore.schoolAssets.delete(assetId);
    return { success: true, message: `Asset ${asset.assetTag} deleted successfully` };
  }
}
