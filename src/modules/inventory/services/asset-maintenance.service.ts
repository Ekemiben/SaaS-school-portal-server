import {
  Injectable,
  NotFoundException,
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
    const asset = await this.prisma.schoolAsset.findFirst({
      where: { id: dto.assetId, tenantId },
    });
    if (!asset) {
      throw new NotFoundException(`School asset with ID '${dto.assetId}' not found`);
    }

    if (dto.performedByVendorId) {
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: dto.performedByVendorId, tenantId },
      });
      if (!vendor) {
        throw new NotFoundException(`Vendor with ID '${dto.performedByVendorId}' not found`);
      }
    }

    const cost = Number(dto.cost) || 0.0;
    const status = dto.status || 'COMPLETED';

    const log = await this.prisma.assetMaintenanceLog.create({
      data: {
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
      },
    });

    // Update asset condition/status if maintenance indicates repair
    if (status === 'SCHEDULED') {
      await this.prisma.schoolAsset.update({
        where: { id: asset.id },
        data: { status: 'UNDER_MAINTENANCE' },
      });
    } else if (status === 'COMPLETED') {
      const condition = ['ROUTINE_SERVICE', 'REPAIR', 'CALIBRATION'].includes(dto.maintenanceType)
        ? 'GOOD'
        : asset.condition;

      await this.prisma.schoolAsset.update({
        where: { id: asset.id },
        data: {
          status: 'IN_SERVICE',
          condition,
        },
      });
    }

    return log;
  }

  async updateMaintenanceLog(tenantId: string, logId: string, dto: UpdateMaintenanceLogDto) {
    const log = await this.prisma.assetMaintenanceLog.findFirst({
      where: { id: logId, tenantId },
    });
    if (!log) {
      throw new NotFoundException(`Maintenance log with ID '${logId}' not found`);
    }

    const updated = await this.prisma.assetMaintenanceLog.update({
      where: { id: logId },
      data: {
        ...dto,
        serviceDate: dto.serviceDate ? new Date(dto.serviceDate) : undefined,
        nextServiceDue: dto.nextServiceDue ? new Date(dto.nextServiceDue) : undefined,
        cost: dto.cost !== undefined ? Number(dto.cost) : undefined,
      },
    });

    // If marked completed, update asset status
    if (dto.status === 'COMPLETED') {
      await this.prisma.schoolAsset.updateMany({
        where: { id: log.assetId, tenantId },
        data: {
          status: 'IN_SERVICE',
          condition: 'GOOD',
        },
      });
    }

    return updated;
  }

  async getMaintenanceLogs(tenantId: string, assetId?: string, status?: string) {
    const where: any = { tenantId };

    if (assetId) {
      where.assetId = assetId;
    }
    if (status) {
      where.status = status;
    }

    return this.prisma.assetMaintenanceLog.findMany({
      where,
      orderBy: { serviceDate: 'desc' },
    });
  }
}
