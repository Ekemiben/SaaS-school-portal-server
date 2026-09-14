import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CalculateDepreciationDto } from '../dto/asset-depreciation.dto.js';

@Injectable()
export class AssetDepreciationService {
  private readonly logger = new Logger(AssetDepreciationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async calculateAssetDepreciation(
    tenantId: string,
    assetId: string,
    financialYear: string,
    period: string,
    userId: string,
    notes?: string,
  ) {
    const asset = this.prisma.memoryStore.schoolAssets.get(assetId);
    if (!asset || asset.tenantId !== tenantId) {
      throw new NotFoundException(`School asset with ID '${assetId}' not found`);
    }

    if (asset.depreciationMethod === 'NONE' || asset.status === 'DECOMMISSIONED' || asset.status === 'WRITTEN_OFF') {
      throw new BadRequestException(
        `Asset '${asset.name}' is exempt from depreciation (Method: ${asset.depreciationMethod}, Status: ${asset.status})`,
      );
    }

    const beginningBookValue = asset.currentBookValue;
    if (beginningBookValue <= asset.salvageValue) {
      throw new BadRequestException(
        `Asset '${asset.name}' has already reached its salvage value of ${asset.salvageValue}`,
      );
    }

    let depreciationAmount = 0.0;

    if (asset.depreciationMethod === 'STRAIGHT_LINE') {
      const usefulYears = Math.max(1, asset.usefulLifeYears);
      const depreciableAmount = Math.max(0, asset.purchaseCost - asset.salvageValue);
      const annualDepreciation = depreciableAmount / usefulYears;

      // If period indicates quarterly, divide by 4; else annual
      if (period.toLowerCase().includes('q') || period.toLowerCase().includes('quarter')) {
        depreciationAmount = annualDepreciation / 4;
      } else {
        depreciationAmount = annualDepreciation;
      }
    } else if (asset.depreciationMethod === 'REDUCING_BALANCE') {
      // Double declining balance rate
      const rate = Math.min(0.5, 2.0 / Math.max(1, asset.usefulLifeYears));
      let periodRate = rate;
      if (period.toLowerCase().includes('q') || period.toLowerCase().includes('quarter')) {
        periodRate = rate / 4;
      }
      depreciationAmount = beginningBookValue * periodRate;
    }

    // Clamp so book value does not drop below salvage value
    const maxAllowableDepreciation = Math.max(0, beginningBookValue - asset.salvageValue);
    depreciationAmount = Math.min(depreciationAmount, maxAllowableDepreciation);
    depreciationAmount = Math.round(depreciationAmount * 100) / 100;

    const endingBookValue = Math.round((beginningBookValue - depreciationAmount) * 100) / 100;

    // Update asset
    asset.currentBookValue = endingBookValue;
    asset.accumulatedDepreciation =
      Math.round((asset.accumulatedDepreciation + depreciationAmount) * 100) / 100;
    asset.lastDepreciationDate = new Date();
    asset.updatedAt = new Date();
    this.prisma.memoryStore.schoolAssets.set(assetId, asset);

    // Record schedule
    const scheduleId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const schedule = {
      id: scheduleId,
      tenantId,
      assetId,
      financialYear,
      period,
      depreciationAmount,
      beginningBookValue,
      endingBookValue,
      calculatedAt: new Date(),
      calculatedBy: userId,
      notes: notes || `Depreciation processed via ${asset.depreciationMethod} method`,
    };

    this.prisma.memoryStore.assetDepreciationSchedules.set(scheduleId, schedule);
    return schedule;
  }

  async processBulkDepreciation(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: CalculateDepreciationDto,
  ) {
    let assets = Array.from(this.prisma.memoryStore.schoolAssets.values()).filter(
      (a: any) =>
        a.tenantId === tenantId &&
        a.depreciationMethod !== 'NONE' &&
        a.status === 'IN_SERVICE' &&
        a.currentBookValue > a.salvageValue,
    );

    if (dto.campusId || campusId) {
      const targetCampus = dto.campusId || campusId;
      assets = assets.filter((a: any) => a.campusId === targetCampus || a.campusId === null);
    }
    if (dto.category) {
      assets = assets.filter((a: any) => a.category === dto.category);
    }

    const results = [];
    for (const asset of assets) {
      try {
        const schedule = await this.calculateAssetDepreciation(
          tenantId,
          asset.id,
          dto.financialYear,
          dto.period,
          userId,
          dto.notes,
        );
        results.push(schedule);
      } catch (err: any) {
        this.logger.warn(`Skipped asset ${asset.assetTag}: ${err.message}`);
      }
    }

    return {
      financialYear: dto.financialYear,
      period: dto.period,
      processedCount: results.length,
      totalDepreciation: results.reduce((acc, s) => acc + s.depreciationAmount, 0),
      schedules: results,
    };
  }

  async getDepreciationSchedules(tenantId: string, assetId?: string, financialYear?: string) {
    let list = Array.from(this.prisma.memoryStore.assetDepreciationSchedules.values()).filter(
      (s: any) => s.tenantId === tenantId,
    );

    if (assetId) {
      list = list.filter((s: any) => s.assetId === assetId);
    }
    if (financialYear) {
      list = list.filter((s: any) => s.financialYear === financialYear);
    }

    return list.sort((a: any, b: any) => b.calculatedAt.getTime() - a.calculatedAt.getTime());
  }
}
