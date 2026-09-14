-- CreateTable
CREATE TABLE "StaffSalaryProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "staffUserId" TEXT NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "housingAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPensionExempt" BOOLEAN NOT NULL DEFAULT false,
    "isNhfExempt" BOOLEAN NOT NULL DEFAULT false,
    "isNhisExempt" BOOLEAN NOT NULL DEFAULT true,
    "isTaxExempt" BOOLEAN NOT NULL DEFAULT false,
    "bankCode" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSalaryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffSalaryProfile_tenantId_idx" ON "StaffSalaryProfile"("tenantId");

-- CreateIndex
CREATE INDEX "StaffSalaryProfile_tenantId_campusId_idx" ON "StaffSalaryProfile"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "StaffSalaryProfile_tenantId_isActive_idx" ON "StaffSalaryProfile"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSalaryProfile_tenantId_staffUserId_key" ON "StaffSalaryProfile"("tenantId", "staffUserId");

-- AddForeignKey
ALTER TABLE "StaffSalaryProfile" ADD CONSTRAINT "StaffSalaryProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSalaryProfile" ADD CONSTRAINT "StaffSalaryProfile_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
