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
    const asset = await this.prisma.schoolAsset.findFirst({
      where: { id: assetId, tenantId },
    });
    if (!asset) {
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

      if (period.toLowerCase().includes('q') || period.toLowerCase().includes('quarter')) {
        depreciationAmount = annualDepreciation / 4;
      } else {
        depreciationAmount = annualDepreciation;
      }
    } else if (asset.depreciationMethod === 'REDUCING_BALANCE') {
      const rate = Math.min(0.5, 2.0 / Math.max(1, asset.usefulLifeYears));
      let periodRate = rate;
      if (period.toLowerCase().includes('q') || period.toLowerCase().includes('quarter')) {
        periodRate = rate / 4;
      }
      depreciationAmount = beginningBookValue * periodRate;
    }

    const maxAllowableDepreciation = Math.max(0, beginningBookValue - asset.salvageValue);
    depreciationAmount = Math.min(depreciationAmount, maxAllowableDepreciation);
    depreciationAmount = Math.round(depreciationAmount * 100) / 100;

    const endingBookValue = Math.round((beginningBookValue - depreciationAmount) * 100) / 100;

    // Update asset
    await this.prisma.schoolAsset.update({
      where: { id: assetId },
      data: {
        currentBookValue: endingBookValue,
        accumulatedDepreciation: Math.round((asset.accumulatedDepreciation + depreciationAmount) * 100) / 100,
        lastDepreciationDate: new Date(),
      },
    });

    // Record schedule
    return this.prisma.assetDepreciationSchedule.create({
      data: {
        tenantId,
        assetId,
        financialYear,
        period,
        depreciationAmount,
        beginningBookValue,
        endingBookValue,
        calculatedBy: userId,
        notes: notes || `Depreciation processed via ${asset.depreciationMethod} method`,
      },
    });
  }

  async processBulkDepreciation(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: CalculateDepreciationDto,
  ) {
    const where: any = {
      tenantId,
      depreciationMethod: { not: 'NONE' },
      status: 'IN_SERVICE',
    };

    if (dto.campusId || campusId) {
      const targetCampus = dto.campusId || campusId;
      where.OR = [{ campusId: targetCampus }, { campusId: null }];
    }
    if (dto.category) {
      where.category = dto.category;
    }

    const assets = await this.prisma.schoolAsset.findMany({ where });
    const eligibleAssets = assets.filter((a) => a.currentBookValue > a.salvageValue);

    const results = [];
    for (const asset of eligibleAssets) {
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
    const where: any = { tenantId };

    if (assetId) {
      where.assetId = assetId;
    }
    if (financialYear) {
      where.financialYear = financialYear;
    }

    return this.prisma.assetDepreciationSchedule.findMany({
      where,
      orderBy: { calculatedAt: 'desc' },
    });
  }
}
