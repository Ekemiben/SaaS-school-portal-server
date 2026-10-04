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

    const existingTag = await this.prisma.schoolAsset.findFirst({
      where: {
        tenantId,
        assetTag: { equals: resolvedTag, mode: 'insensitive' },
      },
    });

    if (existingTag && dto.assetTag) {
      throw new BadRequestException(
        `School asset with tag '${dto.assetTag}' already exists`,
      );
    }

    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.vendorId, tenantId },
      });
      if (!vendor) {
        throw new NotFoundException(`Vendor with ID '${dto.vendorId}' not found`);
      }
    }

    const name = dto.name || (dto as any).item || 'School Asset';
    const unitCost = Number((dto as any).unitCost || dto.purchaseCost || 0.0);
    const purchaseCost = unitCost;
    const salvageValue = Number(dto.salvageValue) || 0.0;
    const usefulLifeYears = Number(dto.usefulLifeYears) || 5;

    const asset = await this.prisma.schoolAsset.create({
      data: {
        tenantId,
        campusId: targetCampusId,
        name,
        assetTag: resolvedTag,
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
        location: dto.location || 'Main Campus Block A',
        assignedToStaffId: dto.assignedToStaffId || null,
        condition: dto.condition || 'GOOD',
        status: 'IN_SERVICE',
        notes: dto.notes || null,
      },
    });

    return this.enrichAsset({
      ...asset,
      custodian: (dto as any).custodian || 'Estate Department',
      qty: Number((dto as any).qty || (dto as any).quantity || 1),
    });
  }

  async updateAsset(tenantId: string, assetId: string, dto: UpdateSchoolAssetDto) {
    await this.getAssetById(tenantId, assetId);

    const updated = await this.prisma.schoolAsset.update({
      where: { id: assetId },
      data: {
        ...dto,
        warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : undefined,
      },
    });

    return this.enrichAsset({
      ...updated,
      qty: (dto as any).qty !== undefined ? Number((dto as any).qty) : Number((dto as any).quantity ?? 1),
    });
  }

  async getAssetById(tenantId: string, assetId: string) {
    const asset = await this.prisma.schoolAsset.findFirst({
      where: { id: assetId, tenantId },
      include: {
        maintenanceLogs: true,
        depreciationSchedules: true,
      },
    });
    if (!asset) {
      throw new NotFoundException(`School asset with ID '${assetId}' not found`);
    }

    let vendor = null;
    if (asset.vendorId) {
      vendor = await this.prisma.vendor.findFirst({
        where: { id: asset.vendorId, tenantId },
      });
    }

    return {
      ...asset,
      vendor,
      maintenanceLogsCount: asset.maintenanceLogs?.length || 0,
      depreciationSchedulesCount: asset.depreciationSchedules?.length || 0,
    };
  }

  async findAllAssets(tenantId: string, filter?: SchoolAssetFilterDto) {
    const where: any = { tenantId };

    if (filter?.campusId) {
      where.OR = [{ campusId: filter.campusId }, { campusId: null }];
    }
    if (filter?.category) {
      where.category = filter.category;
    }
    if (filter?.condition) {
      where.condition = filter.condition;
    }
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.location) {
      where.location = { contains: filter.location, mode: 'insensitive' };
    }
    if (filter?.assignedToStaffId) {
      where.assignedToStaffId = filter.assignedToStaffId;
    }
    if (filter?.search) {
      const q = filter.search;
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { assetTag: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ];
    }

    const assets = await this.prisma.schoolAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return assets.map((a) => this.enrichAsset(a));
  }

  async deleteAsset(tenantId: string, assetId: string) {
    const asset = await this.getAssetById(tenantId, assetId);
    await this.prisma.schoolAsset.delete({
      where: { id: assetId },
    });
    return { success: true, message: `Asset ${asset.assetTag} deleted successfully` };
  }
}
