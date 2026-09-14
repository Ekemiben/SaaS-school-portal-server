-- AlterTable
ALTER TABLE "Result" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "assessmentStructureId" TEXT,
ADD COLUMN     "classId" TEXT,
ADD COLUMN     "componentScores" JSONB,
ADD COLUMN     "gradePoint" DOUBLE PRECISION,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AssessmentStructure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "components" JSONB NOT NULL,
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentStructure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentStructure_tenantId_idx" ON "AssessmentStructure"("tenantId");

-- CreateIndex
CREATE INDEX "AssessmentStructure_tenantId_campusId_idx" ON "AssessmentStructure"("tenantId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentStructure_tenantId_name_key" ON "AssessmentStructure"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Result_tenantId_assessmentStructureId_idx" ON "Result"("tenantId", "assessmentStructureId");

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_assessmentStructureId_fkey" FOREIGN KEY ("assessmentStructureId") REFERENCES "AssessmentStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStructure" ADD CONSTRAINT "AssessmentStructure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentStructure" ADD CONSTRAINT "AssessmentStructure_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
