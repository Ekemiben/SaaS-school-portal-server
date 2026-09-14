import { ReportCardRenderData } from '../dto/report-card.dto.js';

export class ReportCardRenderer {
  static renderHtml(data: ReportCardRenderData): string {
    const primaryColor = data.school.primaryColor || '#1e3a8a';
    const secondaryColor = data.school.secondaryColor || '#0ea5e9';

    const subjectRows = data.subjects
      .map((s, idx) => {
        const componentBreakdown = s.componentScores
          ? Object.entries(s.componentScores)
              .map(([code, score]) => `<span class="badge">${code}: ${score}</span>`)
              .join(' ')
          : '';

        const rankText = s.subjectRank && s.totalStudents ? `${s.subjectRank}/${s.totalStudents}` : '-';
        const classAvgText = s.classAverage !== undefined ? `${s.classAverage}%` : '-';

        return `
        <tr class="${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">
          <td class="font-bold text-slate-800">${s.subjectName} <span class="text-xs text-slate-500">(${s.subjectCode})</span><br>${componentBreakdown}</td>
          <td class="text-center">${s.marksObtained} / ${s.maxMarks}</td>
          <td class="text-center font-semibold">${s.percentage}%</td>
          <td class="text-center font-bold text-indigo-700">${s.grade}</td>
          <td class="text-center">${s.gradePoint.toFixed(1)}</td>
          <td class="text-center text-slate-600">${classAvgText}</td>
          <td class="text-center text-slate-600">${rankText}</td>
          <td class="text-left text-xs italic text-slate-600">${s.teacherRemarks || 'Satisfactory progress'}</td>
        </tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Report Card - ${data.student.fullName} (${data.student.admissionNumber})</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; line-height: 1.4; font-size: 13px; }
    .card-container { max-width: 900px; margin: 0 auto; border: 2px solid ${primaryColor}; border-radius: 8px; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 16px; }
    .school-info h1 { margin: 0 0 4px 0; font-size: 22px; color: ${primaryColor}; text-transform: uppercase; }
    .school-info p { margin: 0; font-size: 12px; color: #64748b; }
    .report-title { text-align: center; background: ${primaryColor}; color: white; padding: 6px; border-radius: 4px; font-weight: bold; font-size: 14px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
    .bio-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 16px; border: 1px solid #e2e8f0; }
    .bio-item { font-size: 12px; }
    .bio-label { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600; }
    .bio-val { font-weight: bold; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 8px 6px; border: 1px solid #cbd5e1; }
    td { padding: 8px 6px; border: 1px solid #e2e8f0; }
    .bg-slate-50 { background-color: #f8fafc; }
    .badge { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 1px 4px; border-radius: 3px; font-size: 10px; margin-top: 2px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; }
    .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .stat-val { font-size: 18px; font-weight: 800; color: ${primaryColor}; margin-top: 2px; }
    .stat-standing { font-size: 12px; font-weight: bold; color: #16a34a; }
    .remarks-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
    .remark-line { margin-bottom: 8px; font-size: 12px; }
    .remark-label { font-weight: 700; color: #334155; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
    .sig-line { width: 180px; border-top: 1px solid #475569; text-align: center; margin-top: 28px; padding-top: 4px; font-size: 11px; font-weight: 600; }
    .verify-code { font-family: monospace; font-size: 10px; color: #94a3b8; }
    @media print { body { padding: 0; } .card-container { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="header">
      <div class="school-info">
        <h1>${data.school.name}</h1>
        <p>${data.school.campusName ? data.school.campusName + ' • ' : ''}${data.school.address || 'Academic Excellence & Character'}</p>
        <p>Email: ${data.school.email || 'admin@school.edu'} | Phone: ${data.school.phone || '+234 800 000 0000'}</p>
      </div>
      ${data.school.logoUrl ? `<img src="${data.school.logoUrl}" alt="Logo" style="max-height: 60px; max-width: 120px;" />` : ''}
    </div>

    <div class="report-title">
      Official Student Terminal Report Card • ${data.examination.name}
    </div>

    <div class="bio-grid">
      <div class="bio-item">
        <div class="bio-label">Student Full Name</div>
        <div class="bio-val">${data.student.fullName}</div>
      </div>
      <div class="bio-item">
        <div class="bio-label">Admission Number</div>
        <div class="bio-val">${data.student.admissionNumber}</div>
      </div>
      <div class="bio-item">
        <div class="bio-label">Class / Grade</div>
        <div class="bio-val">${data.student.className}</div>
      </div>
      <div class="bio-item">
        <div class="bio-label">Attendance</div>
        <div class="bio-val">${data.student.attendancePresent || '-'} / ${data.student.attendanceTotal || '-'} Days</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Subject / Components</th>
          <th style="width: 80px;">Score</th>
          <th style="width: 55px;">%</th>
          <th style="width: 45px;">Grade</th>
          <th style="width: 45px;">GPA</th>
          <th style="width: 60px;">Class Avg</th>
          <th style="width: 60px;">Position</th>
          <th style="text-align: left;">Teacher Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${subjectRows}
      </tbody>
    </table>

    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-label">Total Score</div>
        <div class="stat-val">${data.summary.totalMarks} <span style="font-size: 12px; color: #64748b;">/ ${data.summary.maxMarks}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Overall Average</div>
        <div class="stat-val">${data.summary.percentage}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Term GPA / CGPA</div>
        <div class="stat-val">${data.summary.gpa.toFixed(2)} <span style="font-size: 12px; color: #64748b;">(${data.summary.cgpa.toFixed(2)})</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Class Position</div>
        <div class="stat-val">${data.summary.classRank} <span style="font-size: 11px; color: #64748b;">of ${data.summary.totalStudentsInClass}</span></div>
        <div class="stat-standing">${data.summary.academicStanding}</div>
      </div>
    </div>

    <div class="remarks-box">
      <div class="remark-line">
        <span class="remark-label">Class Teacher's Remarks:</span> ${data.summary.classTeacherRemarks || 'An enthusiastic student with consistent engagement.'}
      </div>
      <div class="remark-line">
        <span class="remark-label">Principal's Remarks:</span> ${data.summary.principalRemarks || 'Commendable performance. Keep striving for greater heights.'}
      </div>
      ${data.examination.nextTermResumptionDate ? `
      <div class="remark-line">
        <span class="remark-label">Next Term Resumption Date:</span> <strong>${data.examination.nextTermResumptionDate}</strong>
      </div>` : ''}
    </div>

    <div class="footer">
      <div>
        <div class="verify-code">Verification Code: ${data.metadata.verificationCode}</div>
        <div>Issued on ${data.metadata.issuedAt}</div>
      </div>
      <div>
        <div class="sig-line">Principal / Administrator</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}
