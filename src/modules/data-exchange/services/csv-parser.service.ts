import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class CsvParserService {
  parse(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
    if (!csvContent || !csvContent.trim()) {
      throw new BadRequestException('CSV content is empty');
    }

    // Strip BOM and normalize line breaks
    const cleanContent = csvContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length < 1) {
      throw new BadRequestException('CSV must contain at least a header row');
    }

    const rawHeaders = this.parseCsvLine(lines[0]);
    const normalizedHeaders = rawHeaders.map((h) => this.normalizeHeader(h));

    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const rowObj: Record<string, string> = { _rowNumber: String(i + 1) };

      for (let j = 0; j < normalizedHeaders.length; j++) {
        const header = normalizedHeaders[j];
        if (header) {
          rowObj[header] = values[j] !== undefined ? values[j].trim() : '';
        }
      }
      rows.push(rowObj);
    }

    return { headers: normalizedHeaders, rows };
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  private normalizeHeader(header: string): string {
    return header
      .trim()
      .replace(/[\s\-_]+/g, '')
      .toLowerCase();
  }

  stringify(headers: string[], data: Record<string, any>[]): string {
    const headerLine = headers.map((h) => this.escapeCsvValue(h)).join(',');
    const dataLines = data.map((row) =>
      headers
        .map((h) => {
          const val = row[h] !== undefined && row[h] !== null ? row[h] : '';
          return this.escapeCsvValue(String(val));
        })
        .join(','),
    );

    return [headerLine, ...dataLines].join('\n');
  }

  private escapeCsvValue(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  getSampleTemplate(type: string): string {
    const templates: Record<string, { headers: string[]; sample: string[] }> = {
      students: {
        headers: [
          'firstName',
          'lastName',
          'middleName',
          'admissionNumber',
          'gender',
          'dateOfBirth',
          'classCode',
          'campusCode',
          'parentEmail',
          'parentPhone',
          'parentName',
          'bloodGroup',
        ],
        sample: [
          'John',
          'Doe',
          'Michael',
          'ADM-2026-001',
          'MALE',
          '2012-05-15',
          'G10-A',
          'CAMPUS-MAIN',
          'parent.doe@example.com',
          '+2348011223344',
          'Mr. Robert Doe',
          'O+',
        ],
      },
      parents: {
        headers: [
          'firstName',
          'lastName',
          'email',
          'phone',
          'relationship',
          'occupation',
          'address',
          'studentAdmissionNumber',
        ],
        sample: [
          'Robert',
          'Doe',
          'parent.doe@example.com',
          '+2348011223344',
          'FATHER',
          'Engineer',
          '12 Victoria Island Lagos',
          'ADM-2026-001',
        ],
      },
      staff: {
        headers: [
          'firstName',
          'lastName',
          'email',
          'phone',
          'staffNumber',
          'designation',
          'department',
          'employmentType',
          'specialization',
        ],
        sample: [
          'Sarah',
          'Jenkins',
          's.jenkins@greenfield.edu.ng',
          '+2348099887766',
          'STF-2026-001',
          'Senior Teacher',
          'Science',
          'FULL_TIME',
          'Physics & Mathematics',
        ],
      },
      grades: {
        headers: [
          'admissionNumber',
          'subjectCode',
          'academicYear',
          'term',
          'classCode',
          'ca1Score',
          'ca2Score',
          'examScore',
        ],
        sample: [
          'ADM-2026-001',
          'MATH-101',
          '2026/2027',
          'FIRST_TERM',
          'G10-A',
          '18',
          '17',
          '55',
        ],
      },
    };

    const target = templates[type.toLowerCase()];
    if (!target) {
      throw new BadRequestException(`Template for type '${type}' not found. Available: students, parents, staff, grades`);
    }

    return [target.headers.join(','), target.sample.join(',')].join('\n');
  }
}
