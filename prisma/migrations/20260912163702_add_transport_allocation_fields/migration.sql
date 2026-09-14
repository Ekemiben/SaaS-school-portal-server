-- AlterTable
ALTER TABLE "StudentTransportAllocation" ADD COLUMN     "dropoffStopName" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "feeAmount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "history" JSONB,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pickupStopName" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "termId" TEXT;

-- AlterTable
ALTER TABLE "TransportRoute" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "StudentTransportAllocation_routeId_idx" ON "StudentTransportAllocation"("routeId");

-- CreateIndex
CREATE INDEX "StudentTransportAllocation_status_idx" ON "StudentTransportAllocation"("status");
