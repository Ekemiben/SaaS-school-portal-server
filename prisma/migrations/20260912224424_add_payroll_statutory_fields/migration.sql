/*
  Warnings:

  - You are about to drop the column `allowances` on the `Payroll` table. All the data in the column will be lost.
  - You are about to drop the column `deductions` on the `Payroll` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payroll" DROP COLUMN "allowances",
DROP COLUMN "deductions",
ADD COLUMN     "breakdown" JSONB,
ADD COLUMN     "campusId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "housingAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nhf" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nhis" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "otherAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "payeTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "payslipUrl" TEXT,
ADD COLUMN     "pensionEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pensionEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "transportAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Payroll_tenantId_campusId_idx" ON "Payroll"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "Payroll_tenantId_month_year_idx" ON "Payroll"("tenantId", "month", "year");

-- CreateIndex
CREATE INDEX "Payroll_tenantId_status_idx" ON "Payroll"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
