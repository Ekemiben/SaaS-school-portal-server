import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubscription(tenantId: string) {
    let sub = Array.from(this.prisma.memoryStore.subscriptions.values()).find(
      (s) => s.tenantId === tenantId,
    );

    if (!sub) {
      sub = {
        id: `sub_${tenantId}`,
        tenantId,
        planId: 'pro',
        status: 'ACTIVE',
        billingCycle: 'monthly',
        trialEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        maxStudents: 2000,
        maxCampuses: 5,
        maxStaff: 150,
        storageLimitMb: 51200,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.prisma.memoryStore.subscriptions.set(sub.id, sub);
    }

    const currentStudents = Array.from(this.prisma.memoryStore.students.values()).filter(
      (s) => s.tenantId === tenantId,
    ).length;

    const currentCampuses = Array.from(this.prisma.memoryStore.campuses.values()).filter(
      (c) => c.tenantId === tenantId,
    ).length;

    return {
      subscription: sub,
      usage: {
        students: { used: currentStudents, limit: sub.maxStudents },
        campuses: { used: currentCampuses, limit: sub.maxCampuses },
      },
    };
  }

  async checkFeatureFlag(tenantId: string, featureName: string): Promise<boolean> {
    const tenant = this.prisma.memoryStore.tenants.get(tenantId);
    if (!tenant || !tenant.features) return true;
    return !!tenant.features[featureName];
  }
}
