export interface MetricUsage {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  isExceeded: boolean;
}

export interface TenantUsageResponseDto {
  tenantId: string;
  planTier: string;
  subscriptionStatus: string;
  isTrial: boolean;
  trialDaysRemaining: number | null;
  currentPeriodEnd: Date | null;
  metrics: {
    students: MetricUsage;
    campuses: MetricUsage;
    staff: MetricUsage;
    storageMb: MetricUsage;
    messagingSms: MetricUsage;
  };
  features: Record<string, boolean>;
}
