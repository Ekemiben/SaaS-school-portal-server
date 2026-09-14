-- CreateTable
CREATE TABLE "AcademicSummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "termId" TEXT,
    "examinationId" TEXT,
    "classId" TEXT NOT NULL,
    "totalSubjects" INTEGER NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "gpa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgpa" DOUBLE PRECISION DEFAULT 0,
    "classRank" INTEGER,
    "totalStudentsInClass" INTEGER,
    "classAveragePercentage" DOUBLE PRECISION,
    "academicStanding" TEXT NOT NULL DEFAULT 'GOOD_STANDING',
    "subjectSummaries" JSONB,
    "status" TEXT NOT NULL DEFAULT 'CALCULATED',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicSummary_tenantId_idx" ON "AcademicSummary"("tenantId");

-- CreateIndex
CREATE INDEX "AcademicSummary_tenantId_classId_idx" ON "AcademicSummary"("tenantId", "classId");

-- CreateIndex
CREATE INDEX "AcademicSummary_tenantId_studentId_idx" ON "AcademicSummary"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "AcademicSummary_tenantId_examinationId_idx" ON "AcademicSummary"("tenantId", "examinationId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSummary_tenantId_studentId_classId_examinationId_key" ON "AcademicSummary"("tenantId", "studentId", "classId", "examinationId");

-- AddForeignKey
ALTER TABLE "AcademicSummary" ADD CONSTRAINT "AcademicSummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicSummary" ADD CONSTRAINT "AcademicSummary_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicSummary" ADD CONSTRAINT "AcademicSummary_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
