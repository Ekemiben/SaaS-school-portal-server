-- Migration: 20260921200000_subscription_plans_and_entitlements

-- 1. Extend SubscriptionStatus enum with EXPIRED and SUSPENDED
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

-- 2. Alter BillingInvoice to associate with Subscription
ALTER TABLE "BillingInvoice" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;

-- 3. Alter Subscription table for four-tier architecture and pricing
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN IF NOT EXISTS "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "incentivesApplied" JSONB,
ADD COLUMN IF NOT EXISTS "metadata" JSONB,
ADD COLUMN IF NOT EXISTS "planTier" TEXT NOT NULL DEFAULT 'STARTER',
ADD COLUMN IF NOT EXISTS "priceAtPurchase" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "planId" DROP NOT NULL,
ALTER COLUMN "planId" DROP DEFAULT,
ALTER COLUMN "billingCycle" SET DEFAULT 'TERMLY',
ALTER COLUMN "maxCampuses" SET DEFAULT 1;

-- 4. Create SubscriptionPlan catalog table
CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "termlyPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "annualPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "yearlyDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "maxStudents" INTEGER NOT NULL DEFAULT 500,
    "maxCampuses" INTEGER NOT NULL DEFAULT 1,
    "maxStaff" INTEGER NOT NULL DEFAULT 50,
    "storageLimitMb" INTEGER NOT NULL DEFAULT 10240,
    "messagingQuota" INTEGER NOT NULL DEFAULT 1000,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- 5. Create PlanFeature catalog table
CREATE TABLE IF NOT EXISTS "PlanFeature" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CORE',
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "quotaLimit" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- 6. Create PlanIncentive catalog table
CREATE TABLE IF NOT EXISTS "PlanIncentive" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "incentiveKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "featureKey" TEXT,
    "discountPercent" DOUBLE PRECISION,
    "extraTrialDays" INTEGER,
    "bonusQuota" INTEGER,
    "quotaType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanIncentive_pkey" PRIMARY KEY ("id")
);

-- 7. Create SubscriptionFeatureOverride table
CREATE TABLE IF NOT EXISTS "SubscriptionFeatureOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quotaLimit" INTEGER,
    "reason" TEXT,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionFeatureOverride_pkey" PRIMARY KEY ("id")
);

-- 8. Create SubscriptionPayment table
CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "billingInvoiceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paymentMethod" TEXT NOT NULL,
    "provider" TEXT,
    "providerReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- 9. Create CustomPlanRequest table
CREATE TABLE IF NOT EXISTS "CustomPlanRequest" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "contactPersonName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "estimatedStudents" INTEGER,
    "campusCount" INTEGER DEFAULT 1,
    "requestedFeatures" JSONB,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPlanRequest_pkey" PRIMARY KEY ("id")
);

-- 10. Indices
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPlan_tier_key" ON "SubscriptionPlan"("tier");
CREATE INDEX IF NOT EXISTS "SubscriptionPlan_tier_idx" ON "SubscriptionPlan"("tier");
CREATE INDEX IF NOT EXISTS "SubscriptionPlan_isActive_idx" ON "SubscriptionPlan"("isActive");

CREATE INDEX IF NOT EXISTS "PlanFeature_planId_idx" ON "PlanFeature"("planId");
CREATE INDEX IF NOT EXISTS "PlanFeature_featureKey_idx" ON "PlanFeature"("featureKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanFeature_planId_featureKey_key" ON "PlanFeature"("planId", "featureKey");

CREATE INDEX IF NOT EXISTS "PlanIncentive_planId_idx" ON "PlanIncentive"("planId");
CREATE INDEX IF NOT EXISTS "PlanIncentive_incentiveKey_idx" ON "PlanIncentive"("incentiveKey");

CREATE INDEX IF NOT EXISTS "SubscriptionFeatureOverride_tenantId_idx" ON "SubscriptionFeatureOverride"("tenantId");
CREATE INDEX IF NOT EXISTS "SubscriptionFeatureOverride_subscriptionId_idx" ON "SubscriptionFeatureOverride"("subscriptionId");
CREATE INDEX IF NOT EXISTS "SubscriptionFeatureOverride_featureKey_idx" ON "SubscriptionFeatureOverride"("featureKey");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionFeatureOverride_subscriptionId_featureKey_key" ON "SubscriptionFeatureOverride"("subscriptionId", "featureKey");

CREATE INDEX IF NOT EXISTS "SubscriptionPayment_tenantId_idx" ON "SubscriptionPayment"("tenantId");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_subscriptionId_idx" ON "SubscriptionPayment"("subscriptionId");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_providerReference_idx" ON "SubscriptionPayment"("providerReference");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_status_idx" ON "SubscriptionPayment"("status");

CREATE INDEX IF NOT EXISTS "CustomPlanRequest_status_idx" ON "CustomPlanRequest"("status");
CREATE INDEX IF NOT EXISTS "CustomPlanRequest_contactEmail_idx" ON "CustomPlanRequest"("contactEmail");

CREATE INDEX IF NOT EXISTS "Subscription_planId_idx" ON "Subscription"("planId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX IF NOT EXISTS "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- 11. Foreign Keys
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanFeature_planId_fkey') THEN
        ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlanIncentive_planId_fkey') THEN
        ALTER TABLE "PlanIncentive" ADD CONSTRAINT "PlanIncentive_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_planId_fkey') THEN
        ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionFeatureOverride_tenantId_fkey') THEN
        ALTER TABLE "SubscriptionFeatureOverride" ADD CONSTRAINT "SubscriptionFeatureOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionFeatureOverride_subscriptionId_fkey') THEN
        ALTER TABLE "SubscriptionFeatureOverride" ADD CONSTRAINT "SubscriptionFeatureOverride_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionPayment_tenantId_fkey') THEN
        ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubscriptionPayment_subscriptionId_fkey') THEN
        ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillingInvoice_subscriptionId_fkey') THEN
        ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 12. Row-Level Security (RLS) Policies

-- SubscriptionPlan (Public Read Catalog, Platform Admin Write)
ALTER TABLE "SubscriptionPlan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_SubscriptionPlan" ON "SubscriptionPlan";
CREATE POLICY "public_read_SubscriptionPlan" ON "SubscriptionPlan"
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "admin_write_SubscriptionPlan" ON "SubscriptionPlan";
CREATE POLICY "admin_write_SubscriptionPlan" ON "SubscriptionPlan"
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- PlanFeature (Public Read Catalog, Platform Admin Write)
ALTER TABLE "PlanFeature" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_PlanFeature" ON "PlanFeature";
CREATE POLICY "public_read_PlanFeature" ON "PlanFeature"
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "admin_write_PlanFeature" ON "PlanFeature";
CREATE POLICY "admin_write_PlanFeature" ON "PlanFeature"
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- PlanIncentive (Public Read Catalog, Platform Admin Write)
ALTER TABLE "PlanIncentive" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_PlanIncentive" ON "PlanIncentive";
CREATE POLICY "public_read_PlanIncentive" ON "PlanIncentive"
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "admin_write_PlanIncentive" ON "PlanIncentive";
CREATE POLICY "admin_write_PlanIncentive" ON "PlanIncentive"
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- CustomPlanRequest (Public Insert, Platform Admin View/Manage)
ALTER TABLE "CustomPlanRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_insert_CustomPlanRequest" ON "CustomPlanRequest";
CREATE POLICY "public_insert_CustomPlanRequest" ON "CustomPlanRequest"
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "admin_all_CustomPlanRequest" ON "CustomPlanRequest";
CREATE POLICY "admin_all_CustomPlanRequest" ON "CustomPlanRequest"
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- SubscriptionFeatureOverride (Strict Tenant Isolation)
ALTER TABLE "SubscriptionFeatureOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionFeatureOverride" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_SubscriptionFeatureOverride" ON "SubscriptionFeatureOverride";
CREATE POLICY "tenant_isolation_SubscriptionFeatureOverride" ON "SubscriptionFeatureOverride"
    FOR ALL
    USING (
        ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
        OR current_setting('app.bypass_rls', true) = 'on'
    )
    WITH CHECK (
        ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
        OR current_setting('app.bypass_rls', true) = 'on'
    );

-- SubscriptionPayment (Strict Tenant Isolation)
ALTER TABLE "SubscriptionPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionPayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_SubscriptionPayment" ON "SubscriptionPayment";
CREATE POLICY "tenant_isolation_SubscriptionPayment" ON "SubscriptionPayment"
    FOR ALL
    USING (
        ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
        OR current_setting('app.bypass_rls', true) = 'on'
    )
    WITH CHECK (
        ("tenantId" IS NOT NULL AND "tenantId" = current_setting('app.current_tenant_id', true))
        OR current_setting('app.bypass_rls', true) = 'on'
    );
