-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN     "classId" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "earlyBirdCutoffDate" TIMESTAMP(3),
ADD COLUMN     "earlyBirdDiscountPercentage" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "items" JSONB,
ADD COLUMN     "lateFeeGraceDays" INTEGER DEFAULT 0,
ADD COLUMN     "lateFeePercentage" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "classId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceUrl" TEXT,
ADD COLUMN     "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "latePenaltyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lineItems" JSONB,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "termId" TEXT,
ADD COLUMN     "waiverAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "FeeStructure_tenantId_academicYearId_idx" ON "FeeStructure"("tenantId", "academicYearId");
