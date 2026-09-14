import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateMaintenanceLogDto,
  UpdateMaintenanceLogDto,
} from '../dto/asset-maintenance.dto.js';

@Injectable()
export class AssetMaintenanceService {
  private readonly logger = new Logger(AssetMaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createMaintenanceLog(tenantId: string, dto: CreateMaintenanceLogDto) {
    const asset = this.prisma.memoryStore.schoolAssets.get(dto.assetId);
    if (!asset || asset.tenantId !== tenantId) {
      throw new NotFoundException(`School asset with ID '${dto.assetId}' not found`);
    }

    if (dto.performedByVendorId) {
      const vendor = this.prisma.memoryStore.vendors.get(dto.performedByVendorId);
      if (!vendor || vendor.tenantId !== tenantId) {
        throw new NotFoundException(`Vendor with ID '${dto.performedByVendorId}' not found`);
      }
    }

    const id = `mnt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cost = Number(dto.cost) || 0.0;
    const status = dto.status || 'COMPLETED';

    const log = {
      id,
      tenantId,
      assetId: dto.assetId,
      maintenanceType: dto.maintenanceType,
      serviceDate: dto.serviceDate ? new Date(dto.serviceDate) : new Date(),
      performedByVendorId: dto.performedByVendorId || null,
      technicianName: dto.technicianName || null,
      cost,
      description: dto.description,
      findings: dto.findings || null,
      nextServiceDue: dto.nextServiceDue ? new Date(dto.nextServiceDue) : null,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.assetMaintenanceLogs.set(id, log);

    // Update asset condition/status if maintenance indicates repair
    if (status === 'SCHEDULED') {
      asset.status = 'UNDER_MAINTENANCE';
    } else if (status === 'COMPLETED') {
      asset.status = 'IN_SERVICE';
      if (['ROUTINE_SERVICE', 'REPAIR', 'CALIBRATION'].includes(dto.maintenanceType)) {
        asset.condition = 'GOOD';
      }
    }
    asset.updatedAt = new Date();
    this.prisma.memoryStore.schoolAssets.set(asset.id, asset);

    return log;
  }

  async updateMaintenanceLog(tenantId: string, logId: string, dto: UpdateMaintenanceLogDto) {
    const log = this.prisma.memoryStore.assetMaintenanceLogs.get(logId);
    if (!log || log.tenantId !== tenantId) {
      throw new NotFoundException(`Maintenance log with ID '${logId}' not found`);
    }

    const updated = {
      ...log,
      ...dto,
      serviceDate: dto.serviceDate ? new Date(dto.serviceDate) : log.serviceDate,
      nextServiceDue: dto.nextServiceDue ? new Date(dto.nextServiceDue) : log.nextServiceDue,
      cost: dto.cost !== undefined ? Number(dto.cost) : log.cost,
      updatedAt: new Date(),
    };

    this.prisma.memoryStore.assetMaintenanceLogs.set(logId, updated);

    // If marked completed, update asset status
    if (dto.status === 'COMPLETED') {
      const asset = this.prisma.memoryStore.schoolAssets.get(log.assetId);
      if (asset) {
        asset.status = 'IN_SERVICE';
        asset.condition = 'GOOD';
        asset.updatedAt = new Date();
        this.prisma.memoryStore.schoolAssets.set(asset.id, asset);
      }
    }

    return updated;
  }

  async getMaintenanceLogs(tenantId: string, assetId?: string, status?: string) {
    let list = Array.from(this.prisma.memoryStore.assetMaintenanceLogs.values()).filter(
      (m: any) => m.tenantId === tenantId,
    );

    if (assetId) {
      list = list.filter((m: any) => m.assetId === assetId);
    }
    if (status) {
      list = list.filter((m: any) => m.status === status);
    }

    return list.sort((a: any, b: any) => b.serviceDate.getTime() - a.serviceDate.getTime());
  }
}
