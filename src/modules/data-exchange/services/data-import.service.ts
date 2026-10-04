import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CsvParserService } from './csv-parser.service.js';
import { AuditService } from '../../audit/audit.service.js';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
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

    const existingStudents = await this.prisma.student.findMany({
      where: { tenantId },
      select: { admissionNumber: true },
    });
    const existingAdmissionNumbers = new Set(
      existingStudents.map((s) => (s.admissionNumber || '').toLowerCase()),
    );

    const { errors, validRowsData } = validateStudentRows(rows, existingAdmissionNumbers);

    let createdCount = 0;
    let jobId: string | undefined = undefined;

    if (mode === 'COMMIT' && errors.length === 0) {
      let targetCampusId = campusId;
      if (!targetCampusId) {
        const defaultCampus = await this.prisma.campus.findFirst({ where: { tenantId } });
        targetCampusId = defaultCampus?.id || 'campus_main_01';
      }

      for (const data of validRowsData) {
        await this.prisma.student.create({
          data: {
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
          },
        });
        createdCount++;
      }

      const createdJob = await this.prisma.dataImportJob.create({
        data: {
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
        },
      });
      jobId = createdJob.id;

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
        const cleanEmail = d.email ? d.email.toLowerCase().trim() : null;
        const cleanPhone = d.phone ? d.phone.replace(/\s+/g, '').trim() : null;

        try {
          let parentUserId: string | null = null;
          if (cleanEmail || cleanPhone) {
            const existingUser = await this.prisma.user.findFirst({
              where: {
                tenantId,
                OR: [
                  ...(cleanEmail ? [{ email: cleanEmail }] : []),
                  ...(cleanPhone ? [{ phone: cleanPhone }] : []),
                ],
              },
            });

            let role = await this.prisma.role.findFirst({
              where: { tenantId, name: 'PARENT' },
            });
            if (!role) {
              role = await this.prisma.role.create({
                data: {
                  tenantId,
                  name: 'PARENT',
                  description: 'Parent or Guardian with student ward portal access',
                  isSystem: true,
                },
              });
            }

            if (existingUser) {
              parentUserId = existingUser.id;
              await this.prisma.userRole.upsert({
                where: {
                  userId_roleId: {
                    userId: existingUser.id,
                    roleId: role.id,
                  },
                },
                create: {
                  userId: existingUser.id,
                  roleId: role.id,
                },
                update: {},
              });
            } else {
              const passwordHash = await bcrypt.hash(randomUUID(), 10);
              const userEmail = cleanEmail || `${cleanPhone || randomUUID().substring(0, 8)}@parent.portal`;
              const createdUser = await this.prisma.user.create({
                data: {
                  tenantId,
                  email: userEmail,
                  phone: cleanPhone,
                  firstName: d.firstName,
                  lastName: d.lastName,
                  passwordHash,
                  isActive: true,
                  userRoles: {
                    create: {
                      roleId: role.id,
                    },
                  },
                },
              });
              parentUserId = createdUser.id;
            }
          }

          const createdParent = await this.prisma.parent.create({
            data: {
              tenantId,
              userId: parentUserId || undefined,
              firstName: d.firstName,
              lastName: d.lastName,
              email: cleanEmail,
              phone: cleanPhone || '',
              relationship: d.relationship || 'Parent',
            },
          });

          // Link to student ward if studentadmissionnumber is provided
          if (d.admNum) {
            const student = await this.prisma.student.findFirst({
              where: { tenantId, admissionNumber: d.admNum },
            });
            if (student) {
              await this.prisma.studentParent.upsert({
                where: {
                  studentId_parentId: {
                    studentId: student.id,
                    parentId: createdParent.id,
                  },
                },
                create: {
                  studentId: student.id,
                  parentId: createdParent.id,
                  isPrimaryContact: true,
                },
                update: {},
              });
            }
          }

          createdCount++;
        } catch (err: any) {
          this.logger.warn(`Failed DB import for parent ${d.email || d.phone}: ${err.message}`);
        }
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
      let targetCampusId = campusId;
      if (!targetCampusId) {
        const defaultCampus = await this.prisma.campus.findFirst({ where: { tenantId } });
        targetCampusId = defaultCampus?.id || 'campus_main_01';
      }

      for (const d of validRowsData) {
        try {
          await this.prisma.teacher.create({
            data: {
              tenantId,
              campusId: targetCampusId,
              employeeNumber: d.staffNumber,
              firstName: d.firstName,
              lastName: d.lastName,
              email: d.email,
              specialization: d.designation || 'Teacher',
              isActive: true,
            },
          });
          createdCount++;
        } catch (err: any) {
          this.logger.warn(`Failed staff import for ${d.email}: ${err.message}`);
        }
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
        try {
          const student = await this.prisma.student.findFirst({
            where: { tenantId, admissionNumber: d.admNum },
          });
          const subject = await this.prisma.subject.findFirst({
            where: { tenantId, code: d.subjectCode },
          });

          if (student && subject) {
            let exam = await this.prisma.examination.findFirst({ where: { tenantId } });
            if (!exam) {
              let academicYear = await this.prisma.academicYear.findFirst({ where: { tenantId } });
              if (!academicYear) {
                academicYear = await this.prisma.academicYear.create({
                  data: {
                    tenantId,
                    name: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
                  },
                });
              }
              let term = await this.prisma.term.findFirst({ where: { tenantId, academicYearId: academicYear.id } });
              if (!term) {
                term = await this.prisma.term.create({
                  data: {
                    tenantId,
                    academicYearId: academicYear.id,
                    name: 'First Term',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
                  },
                });
              }
              exam = await this.prisma.examination.create({
                data: {
                  tenantId,
                  campusId: student.campusId,
                  academicYearId: academicYear.id,
                  termId: term.id,
                  name: 'General Assessment Term',
                  examType: 'TERM_EXAM',
                  startDate: new Date(),
                  endDate: new Date(),
                },
              });
            }

            await this.prisma.result.create({
              data: {
                tenantId,
                examinationId: exam.id,
                studentId: student.id,
                subjectId: subject.id,
                marksObtained: d.total,
                maxMarks: 100,
                grade: d.grade,
                isPublished: true,
                publishedAt: new Date(),
                componentScores: { ca1: d.ca1, ca2: d.ca2, exam: d.exam },
              },
            });
            createdCount++;
          }
        } catch (err: any) {
          this.logger.warn(`Failed grade import for student ${d.admNum}: ${err.message}`);
        }
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
    return this.prisma.dataImportJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
