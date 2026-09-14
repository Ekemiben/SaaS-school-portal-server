-- AlterTable
ALTER TABLE "TransportRoute" ADD COLUMN     "trackingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackingMode" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "VehicleGpsLog" ADD COLUMN     "accuracy" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT DEFAULT 'PHONE',
ADD COLUMN     "tripId" TEXT;

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "vehicleNumber" TEXT NOT NULL,
    "model" TEXT,
    "capacity" INTEGER DEFAULT 30,
    "ownershipType" TEXT NOT NULL DEFAULT 'SCHOOL_OWNED',
    "providerName" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trackingMode" TEXT NOT NULL DEFAULT 'NONE',
    "deviceId" TEXT,
    "deviceSecret" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTrip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "routeId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "tripType" TEXT NOT NULL DEFAULT 'PICKUP',
    "trackingMode" TEXT NOT NULL DEFAULT 'NONE',
    "trackingSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripBoardingRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "stopId" TEXT,
    "stopName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "boardingTime" TIMESTAMP(3),
    "dropoffTime" TIMESTAMP(3),
    "boardingMethod" TEXT NOT NULL DEFAULT 'MANUAL',
    "recordedByUserId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripBoardingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_idx" ON "Vehicle"("tenantId");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_campusId_idx" ON "Vehicle"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_trackingMode_idx" ON "Vehicle"("tenantId", "trackingMode");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_vehicleNumber_key" ON "Vehicle"("tenantId", "vehicleNumber");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_idx" ON "TransportTrip"("tenantId");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_campusId_idx" ON "TransportTrip"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_routeId_idx" ON "TransportTrip"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "TransportTrip_tenantId_status_idx" ON "TransportTrip"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TripBoardingRecord_tenantId_idx" ON "TripBoardingRecord"("tenantId");

-- CreateIndex
CREATE INDEX "TripBoardingRecord_tenantId_tripId_idx" ON "TripBoardingRecord"("tenantId", "tripId");

-- CreateIndex
CREATE INDEX "TripBoardingRecord_tenantId_studentId_idx" ON "TripBoardingRecord"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "TripBoardingRecord_tenantId_status_idx" ON "TripBoardingRecord"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripBoardingRecord_tripId_studentId_key" ON "TripBoardingRecord"("tripId", "studentId");

-- CreateIndex
CREATE INDEX "VehicleGpsLog_tenantId_tripId_idx" ON "VehicleGpsLog"("tenantId", "tripId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBoardingRecord" ADD CONSTRAINT "TripBoardingRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBoardingRecord" ADD CONSTRAINT "TripBoardingRecord_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripBoardingRecord" ADD CONSTRAINT "TripBoardingRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleGpsLog" ADD CONSTRAINT "VehicleGpsLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
