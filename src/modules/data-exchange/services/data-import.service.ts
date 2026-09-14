import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CsvParserService } from './csv-parser.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  ImportStudentsDto,
  ImportParentsDto,
  ImportStaffDto,
  ImportGradesDto,
  ImportValidationResultDto,
} from '../dto/import-data.dto.js';
import {
  validateStudentRows,
  validateParentRows,
  validateStaffRows,
  validateGradeRows,
} from './import-row-validators.js';

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly csvParser: CsvParserService,
    private readonly auditService: AuditService,
  ) {}

  async importStudents(
    tenantId: string,
    campusId: string | undefined,
    userId: string,
    dto: ImportStudentsDto,
  ): Promise<ImportValidationResultDto> {
    const mode = (dto.mode || 'DRY_RUN').toUpperCase() as 'DRY_RUN' | 'COMMIT';
    const { rows } = this.csvParser.parse(dto.csvContent);

    const existingAdmissionNumbers = new Set(
      Array.from(this.prisma.memoryStore.students.values())
        .filter((s: any) => s.tenantId === tenantId)
        .map((s: any) => (s.admissionNumber || '').toLowerCase()),
    );

    const { errors, validRowsData } = validateStudentRows(rows, existingAdmissionNumbers);

    let createdCount = 0;
    let jobId: string | undefined = undefined;

    if (mode === 'COMMIT' && errors.length === 0) {
      for (const data of validRowsData) {
        const studentId = `std_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const targetCampusId = campusId || 'campus_main_01';

        const student = {
          id: studentId,
          tenantId,
          campusId: targetCampusId,
          admissionNumber: data.admissionNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth,
          bloodGroup: data.bloodGroup,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        this.prisma.memoryStore.students.set(studentId, student);
        createdCount++;
      }

      jobId = `impjob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.prisma.memoryStore.dataImportJobs.set(jobId, {
        id: jobId,
        tenantId,
        campusId,
        type: 'STUDENTS',
        fileName: 'students_import.csv',
        totalRows: rows.length,
        processedRows: rows.length,
        successfulRows: createdCount,
        failedRows: errors.length,
        status: 'COMPLETED',
        performedByUserId: userId,
        createdAt: new Date(),
      });

      await this.auditService.log({
        tenantId,
        actorUserId: userId,
        action: 'BULK_IMPORT_STUDENTS',
        resourceType: 'STUDENT_BATCH',
        resourceId: jobId,
        afterData: { totalRows: rows.length, successfulRows: createdCount },
      });
    }

    return {
      type: 'STUDENTS',
      mode,
      totalRows: rows.length,
      validRows: validRowsData.length,
      invalidRows: rows.length - validRowsData.length,
      errors,
      createdCount: mode === 'COMMIT' ? createdCount : undefined,
      jobId,
      summaryMessage:
        mode === 'DRY_RUN'
          ? `Dry-run completed: ${validRowsData.length} valid rows, ${errors.length} errors found.`
          : errors.length === 0
          ? `Successfully imported ${createdCount} students.`
          : `Import failed with ${errors.length} validation errors. No records were committed.`,
    };
  }

  async importParents(tenantId: string, userId: string, dto: ImportParentsDto): Promise<ImportValidationResultDto> {
    const mode = (dto.mode || 'DRY_RUN').toUpperCase() as 'DRY_RUN' | 'COMMIT';
    const { rows } = this.csvParser.parse(dto.csvContent);
    const { errors, validRowsData } = validateParentRows(rows);

    let createdCount = 0;
    if (mode === 'COMMIT' && errors.length === 0) {
      for (const d of validRowsData) {
        const parentId = `par_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.prisma.memoryStore.parents.set(parentId, {
          id: parentId,
          tenantId,
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email,
          phone: d.phone,
          relationship: d.relationship,
          createdAt: new Date(),
        });
        createdCount++;
      }
    }

    return {
      type: 'PARENTS',
      mode,
      totalRows: rows.length,
      validRows: validRowsData.length,
      invalidRows: rows.length - validRowsData.length,
      errors,
      createdCount: mode === 'COMMIT' ? createdCount : undefined,
      summaryMessage: mode === 'DRY_RUN' ? `Validation: ${validRowsData.length} valid rows.` : `Imported ${createdCount} parents.`,
    };
  }

  async importStaff(tenantId: string, campusId: string | undefined, userId: string, dto: ImportStaffDto): Promise<ImportValidationResultDto> {
    const mode = (dto.mode || 'DRY_RUN').toUpperCase() as 'DRY_RUN' | 'COMMIT';
    const { rows } = this.csvParser.parse(dto.csvContent);
    const { errors, validRowsData } = validateStaffRows(rows);

    let createdCount = 0;
    if (mode === 'COMMIT' && errors.length === 0) {
      for (const d of validRowsData) {
        const teacherId = `tch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.prisma.memoryStore.teachers.set(teacherId, {
          id: teacherId,
          tenantId,
          campusId: campusId || 'campus_main_01',
          employeeNumber: d.staffNumber,
          firstName: d.firstName,
          lastName: d.lastName,
          email: d.email,
          designation: d.designation,
          department: d.department,
          status: 'ACTIVE',
          createdAt: new Date(),
        });
        createdCount++;
      }
    }

    return {
      type: 'STAFF',
      mode,
      totalRows: rows.length,
      validRows: validRowsData.length,
      invalidRows: rows.length - validRowsData.length,
      errors,
      createdCount: mode === 'COMMIT' ? createdCount : undefined,
      summaryMessage: mode === 'DRY_RUN' ? `Validation: ${validRowsData.length} valid rows.` : `Imported ${createdCount} staff members.`,
    };
  }

  async importGrades(tenantId: string, campusId: string | undefined, userId: string, dto: ImportGradesDto): Promise<ImportValidationResultDto> {
    const mode = (dto.mode || 'DRY_RUN').toUpperCase() as 'DRY_RUN' | 'COMMIT';
    const { rows } = this.csvParser.parse(dto.csvContent);
    const { errors, validRowsData } = validateGradeRows(rows);

    let createdCount = 0;
    if (mode === 'COMMIT' && errors.length === 0) {
      for (const d of validRowsData) {
        const resultId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this.prisma.memoryStore.results.set(resultId, {
          id: resultId,
          tenantId,
          campusId: campusId || 'campus_main_01',
          subjectId: d.subjectCode,
          caScore: d.ca1 + d.ca2,
          examScore: d.exam,
          totalScore: d.total,
          grade: d.grade,
          status: 'PUBLISHED',
          createdAt: new Date(),
        });
        createdCount++;
      }
    }

    return {
      type: 'GRADES',
      mode,
      totalRows: rows.length,
      validRows: validRowsData.length,
      invalidRows: rows.length - validRowsData.length,
      errors,
      createdCount: mode === 'COMMIT' ? createdCount : undefined,
      summaryMessage: mode === 'DRY_RUN' ? `Validation: ${validRowsData.length} valid rows.` : `Imported ${createdCount} grades.`,
    };
  }

  async getImportJobs(tenantId: string) {
    return Array.from(this.prisma.memoryStore.dataImportJobs.values())
      .filter((j: any) => j.tenantId === tenantId)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
