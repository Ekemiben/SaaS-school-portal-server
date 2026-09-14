-- AlterTable
ALTER TABLE "TenantDomain" ADD COLUMN     "sslExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sslIssuedAt" TIMESTAMP(3),
ADD COLUMN     "sslStatus" TEXT DEFAULT 'PENDING';
