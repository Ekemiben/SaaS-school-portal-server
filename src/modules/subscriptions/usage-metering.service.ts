import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { TenantUsageResponseDto, MetricUsage } from './dto/usage-metering.dto.js';

@Injectable()
export class UsageMeteringService {
  private readonly logger = new Logger(UsageMeteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  private calculateMetric(used: number, limit: number): MetricUsage {
    const remaining = Math.max(0, limit - used);
    const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100 * 10) / 10) : 100;
    const isExceeded = used >= limit;

    return {
      used,
      limit,
      remaining,
      percentage,
      isExceeded,
    };
  }

  async getTenantUsage(tenantId: string): Promise<TenantUsageResponseDto> {
    const subRes = await this.subscriptionsService.getSubscription(tenantId);
    const sub = subRes.subscription;
    const plan = subRes.planDetails;

    // 1. Students count
    const studentCount = await this.prisma.student.count({
      where: {
        tenantId,
        status: { not: 'GRADUATED' as any },
      },
    });

    // 2. Campuses count
    const campusCount = await this.prisma.campus.count({
      where: { tenantId },
    });

    // 3. Staff count
    const staffCount = await this.prisma.teacher.count({
      where: { tenantId },
    });

    // 4. Storage MB calculation
    const storageAgg = await this.prisma.fileAsset.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    });
    const totalBytes = storageAgg._sum?.sizeBytes || 0;
    const storageUsedMb = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

    // 5. Messaging SMS sent
    const smsCount = await this.prisma.notification.count({
      where: {
        tenantId,
        channel: 'SMS',
      },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true },
    });

    const isTrial = sub.tier === 'free_trial' || sub.status === 'TRIAL';
    let trialDaysRemaining: number | null = null;
    if (sub.trialEndsAt) {
      const msLeft = new Date(sub.trialEndsAt).getTime() - Date.now();
      trialDaysRemaining = Math.max(0, Math.ceil(msLeft / 86400000));
    }

    const maxStudents = sub.maxStudents || plan.maxStudents;
    const maxCampuses = sub.maxCampuses || plan.maxCampuses;
    const maxStaff = sub.maxStaff || plan.maxStaff;
    const storageLimitMb = sub.storageLimitMb || plan.storageLimitMb;
    const messagingQuota = (sub as any).messagingQuota || plan.messagingQuota;

    return {
      tenantId,
      planTier: sub.tier || plan.tier,
      subscriptionStatus: sub.status,
      isTrial,
      trialDaysRemaining,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
      metrics: {
        students: this.calculateMetric(studentCount, maxStudents),
        campuses: this.calculateMetric(campusCount, maxCampuses),
        staff: this.calculateMetric(staffCount, maxStaff),
        storageMb: this.calculateMetric(storageUsedMb, storageLimitMb),
        messagingSms: this.calculateMetric(smsCount, messagingQuota),
      },
      features: (tenant?.features as any) || {},
    };
  }

  async enforceStudentQuota(tenantId: string, countToAdd: number = 1): Promise<void> {
    const usage = await this.getTenantUsage(tenantId);
    if (usage.metrics.students.used + countToAdd > usage.metrics.students.limit) {
      throw new BadRequestException(
        `Student quota exceeded. Your plan (${usage.planTier}) allows max ${usage.metrics.students.limit} students. Currently used: ${usage.metrics.students.used}. Please upgrade your subscription plan.`,
      );
    }
  }

  async enforceCampusQuota(tenantId: string, countToAdd: number = 1): Promise<void> {
    const usage = await this.getTenantUsage(tenantId);
    if (usage.metrics.campuses.used + countToAdd > usage.metrics.campuses.limit) {
      throw new BadRequestException(
        `Campus quota exceeded. Your plan (${usage.planTier}) allows max ${usage.metrics.campuses.limit} campuses. Currently used: ${usage.metrics.campuses.used}. Please upgrade to a higher subscription tier.`,
      );
    }
  }

  async enforceStaffQuota(tenantId: string, countToAdd: number = 1): Promise<void> {
    const usage = await this.getTenantUsage(tenantId);
    if (usage.metrics.staff.used + countToAdd > usage.metrics.staff.limit) {
      throw new BadRequestException(
        `Staff quota exceeded. Your plan (${usage.planTier}) allows max ${usage.metrics.staff.limit} staff members. Currently used: ${usage.metrics.staff.used}. Please upgrade your subscription plan.`,
      );
    }
  }

  async enforceStorageQuota(tenantId: string, bytesToAdd: number): Promise<void> {
    const usage = await this.getTenantUsage(tenantId);
    const mbToAdd = bytesToAdd / (1024 * 1024);
    if (usage.metrics.storageMb.used + mbToAdd > usage.metrics.storageMb.limit) {
      throw new BadRequestException(
        `Storage quota exceeded. Your plan (${usage.planTier}) has ${usage.metrics.storageMb.limit} MB limit. Currently used: ${usage.metrics.storageMb.used} MB. Please upgrade your storage limit.`,
      );
    }
  }

  async enforceMessagingQuota(tenantId: string, creditsNeeded: number = 1): Promise<void> {
    const usage = await this.getTenantUsage(tenantId);
    if (usage.metrics.messagingSms.used + creditsNeeded > usage.metrics.messagingSms.limit) {
      throw new BadRequestException(
        `SMS messaging quota exhausted. Your plan (${usage.planTier}) allows ${usage.metrics.messagingSms.limit} SMS credits. Please purchase an SMS add-on or upgrade your tier.`,
      );
    }
  }

  async enforceFeatureAccess(tenantId: string, featureKey: string): Promise<void> {
    const allowed = await this.subscriptionsService.checkFeatureFlag(tenantId, featureKey);
    if (!allowed) {
      throw new ForbiddenException(
        `Feature '${featureKey}' is not enabled on your current subscription plan. Please upgrade to access this module.`,
      );
    }
  }
}
