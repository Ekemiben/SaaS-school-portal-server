import { RowValidationError } from '../dto/import-data.dto.js';

export function validateStudentRows(
  rows: Record<string, string>[],
  existingAdmissionNumbers: Set<string>,
): { errors: RowValidationError[]; validRowsData: any[] } {
  const errors: RowValidationError[] = [];
  const validRowsData: any[] = [];
  const seenAdmissionNumbers = new Set<string>();

  for (const row of rows) {
    const rowNum = Number(row._rowNumber);
    const firstName = row.firstname || row.first_name || '';
    const lastName = row.lastname || row.last_name || '';
    const admissionNumber = row.admissionnumber || row.admission_number || '';
    const gender = (row.gender || '').toUpperCase();
    const dobStr = row.dateofbirth || row.date_of_birth || row.dob || '';

    if (!firstName) {
      errors.push({ row: rowNum, column: 'firstName', value: firstName, message: 'First name is required' });
    }
    if (!lastName) {
      errors.push({ row: rowNum, column: 'lastName', value: lastName, message: 'Last name is required' });
    }
    if (!admissionNumber) {
      errors.push({ row: rowNum, column: 'admissionNumber', value: admissionNumber, message: 'Admission number is required' });
    } else {
      const lowerAdm = admissionNumber.toLowerCase();
      if (seenAdmissionNumbers.has(lowerAdm)) {
        errors.push({ row: rowNum, column: 'admissionNumber', value: admissionNumber, message: 'Duplicate admission number in CSV' });
      } else if (existingAdmissionNumbers.has(lowerAdm)) {
        errors.push({ row: rowNum, column: 'admissionNumber', value: admissionNumber, message: 'Admission number already exists in school' });
      }
      seenAdmissionNumbers.add(lowerAdm);
    }

    if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      errors.push({ row: rowNum, column: 'gender', value: gender, message: 'Gender must be MALE, FEMALE, or OTHER' });
    }

    let parsedDob: Date | null = null;
    if (dobStr) {
      parsedDob = new Date(dobStr);
      if (isNaN(parsedDob.getTime())) {
        errors.push({ row: rowNum, column: 'dateOfBirth', value: dobStr, message: 'Invalid date of birth format (YYYY-MM-DD)' });
      }
    }

    if (!errors.some((e) => e.row === rowNum)) {
      validRowsData.push({
        firstName,
        lastName,
        middleName: row.middlename || null,
        admissionNumber,
        gender: gender || 'MALE',
        dateOfBirth: parsedDob,
        classCode: row.classcode || null,
        campusCode: row.campuscode || null,
        parentEmail: row.parentemail || null,
        parentPhone: row.parentphone || null,
        parentName: row.parentname || null,
        bloodGroup: row.bloodgroup || null,
      });
    }
  }

  return { errors, validRowsData };
}

export function validateParentRows(rows: Record<string, string>[]): { errors: RowValidationError[]; validRowsData: any[] } {
  const errors: RowValidationError[] = [];
  const validRowsData: any[] = [];

  for (const row of rows) {
    const rowNum = Number(row._rowNumber);
    const firstName = row.firstname || '';
    const lastName = row.lastname || '';
    const email = row.email || '';
    const phone = row.phone || '';
    const admNum = row.studentadmissionnumber || row.admissionnumber || '';

    if (!firstName) errors.push({ row: rowNum, column: 'firstName', value: firstName, message: 'First name is required' });
    if (!lastName) errors.push({ row: rowNum, column: 'lastName', value: lastName, message: 'Last name is required' });
    if (!email && !phone) errors.push({ row: rowNum, column: 'email/phone', value: '', message: 'At least email or phone is required' });

    if (!errors.some((e) => e.row === rowNum)) {
      validRowsData.push({ firstName, lastName, email, phone, relationship: row.relationship || 'GUARDIAN', admNum });
    }
  }

  return { errors, validRowsData };
}

export function validateStaffRows(rows: Record<string, string>[]): { errors: RowValidationError[]; validRowsData: any[] } {
  const errors: RowValidationError[] = [];
  const validRowsData: any[] = [];

  for (const row of rows) {
    const rowNum = Number(row._rowNumber);
    const firstName = row.firstname || '';
    const lastName = row.lastname || '';
    const email = (row.email || '').toLowerCase().trim();
    const staffNumber = row.staffnumber || row.staff_number || '';

    if (!firstName) errors.push({ row: rowNum, column: 'firstName', value: firstName, message: 'First name is required' });
    if (!lastName) errors.push({ row: rowNum, column: 'lastName', value: lastName, message: 'Last name is required' });
    if (!email || !email.includes('@')) errors.push({ row: rowNum, column: 'email', value: email, message: 'Valid email is required' });
    if (!staffNumber) errors.push({ row: rowNum, column: 'staffNumber', value: staffNumber, message: 'Staff number is required' });

    if (!errors.some((e) => e.row === rowNum)) {
      validRowsData.push({ firstName, lastName, email, staffNumber, department: row.department || null, designation: row.designation || 'Teacher' });
    }
  }

  return { errors, validRowsData };
}

export function validateGradeRows(rows: Record<string, string>[]): { errors: RowValidationError[]; validRowsData: any[] } {
  const errors: RowValidationError[] = [];
  const validRowsData: any[] = [];

  for (const row of rows) {
    const rowNum = Number(row._rowNumber);
    const admNum = row.admissionnumber || '';
    const subjectCode = row.subjectcode || '';
    const ca1 = parseFloat(row.ca1score || '0');
    const ca2 = parseFloat(row.ca2score || '0');
    const exam = parseFloat(row.examscore || '0');

    if (!admNum) errors.push({ row: rowNum, column: 'admissionNumber', value: admNum, message: 'Admission number required' });
    if (!subjectCode) errors.push({ row: rowNum, column: 'subjectCode', value: subjectCode, message: 'Subject code required' });
    if (isNaN(ca1) || ca1 < 0 || ca1 > 20) errors.push({ row: rowNum, column: 'ca1Score', value: row.ca1score, message: 'CA1 must be 0-20' });
    if (isNaN(ca2) || ca2 < 0 || ca2 > 20) errors.push({ row: rowNum, column: 'ca2Score', value: row.ca2score, message: 'CA2 must be 0-20' });
    if (isNaN(exam) || exam < 0 || exam > 60) errors.push({ row: rowNum, column: 'examScore', value: row.examscore, message: 'Exam must be 0-60' });

    if (!errors.some((e) => e.row === rowNum)) {
      const total = ca1 + ca2 + exam;
      const grade = total >= 70 ? 'A' : total >= 60 ? 'B' : total >= 50 ? 'C' : total >= 40 ? 'D' : 'F';
      validRowsData.push({ admNum, subjectCode, ca1, ca2, exam, total, grade });
    }
  }

  return { errors, validRowsData };
}
