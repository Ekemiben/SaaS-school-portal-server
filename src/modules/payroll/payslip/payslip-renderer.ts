export interface PayslipRenderData {
  school: {
    name: string;
    logoUrl?: string;
    campusName?: string;
    address?: string;
    email?: string;
    currency?: string;
  };
  staff: {
    name: string;
    employeeNumber?: string;
    email?: string;
    bankName?: string;
    accountNumber?: string;
  };
  period: {
    month: number;
    year: number;
    paymentDate?: string;
    paymentReference?: string;
    status: string;
  };
  earnings: {
    basicSalary: number;
    housingAllowance: number;
    transportAllowance: number;
    otherAllowances: number;
    grossSalary: number;
  };
  deductions: {
    payeTax: number;
    pensionEmployee: number;
    pensionEmployer: number;
    nhf: number;
    nhis: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  netSalary: number;
}

export class PayslipRenderer {
  private static formatCurrency(amount: number, currency: string = 'NGN'): string {
    const symbol = currency === 'NGN' ? '₦' : currency + ' ';
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private static getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return months[month - 1] || `Month ${month}`;
  }

  static renderHtml(data: PayslipRenderData): string {
    const curr = data.school.currency || 'NGN';
    const monthName = this.getMonthName(data.period.month);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payslip - ${data.staff.name} - ${monthName} ${data.period.year}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 32px; background: #fff; }
    .payslip-container { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }
    .school-name { font-size: 24px; font-weight: bold; color: #0f172a; margin: 0; }
    .school-sub { font-size: 14px; color: #64748b; margin-top: 4px; }
    .title-badge { background: #e0f2fe; color: #0369a1; padding: 6px 16px; border-radius: 9999px; font-weight: 600; font-size: 14px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; }
    .info-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .info-val { font-size: 14px; font-weight: 500; color: #0f172a; }
    .tables-container { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; }
    td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .amount-col { text-align: right; }
    .total-row td { font-weight: bold; background: #f8fafc; border-top: 1px solid #cbd5e1; }
    .net-box { background: #0f172a; color: #fff; border-radius: 8px; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .net-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
    .net-amount { font-size: 28px; font-weight: 800; color: #38bdf8; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="payslip-container">
    <div class="header">
      <div>
        <h1 class="school-name">${data.school.name}</h1>
        <div class="school-sub">${data.school.campusName ? data.school.campusName + ' • ' : ''}${data.school.address || 'Confidential Payroll Statement'}</div>
      </div>
      <div>
        <span class="title-badge">PAYSLIP - ${monthName.toUpperCase()} ${data.period.year}</span>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="info-label">Staff Details</div>
        <div class="info-val">${data.staff.name}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">ID: ${data.staff.employeeNumber || 'STAFF'} • ${data.staff.email || ''}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Disbursement Details</div>
        <div class="info-val">${data.staff.bankName || 'Direct Transfer'}: ${data.staff.accountNumber || 'On File'}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Ref: ${data.period.paymentReference || 'N/A'} • Status: ${data.period.status}</div>
      </div>
    </div>

    <div class="tables-container">
      <div>
        <table>
          <thead>
            <tr><th>Earnings Component</th><th class="amount-col">Amount</th></tr>
          </thead>
          <tbody>
            <tr><td>Basic Salary</td><td class="amount-col">${this.formatCurrency(data.earnings.basicSalary, curr)}</td></tr>
            <tr><td>Housing Allowance</td><td class="amount-col">${this.formatCurrency(data.earnings.housingAllowance, curr)}</td></tr>
            <tr><td>Transport Allowance</td><td class="amount-col">${this.formatCurrency(data.earnings.transportAllowance, curr)}</td></tr>
            <tr><td>Other Allowances / Bonus</td><td class="amount-col">${this.formatCurrency(data.earnings.otherAllowances, curr)}</td></tr>
            <tr class="total-row"><td>Gross Earnings</td><td class="amount-col">${this.formatCurrency(data.earnings.grossSalary, curr)}</td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <table>
          <thead>
            <tr><th>Deductions Component</th><th class="amount-col">Amount</th></tr>
          </thead>
          <tbody>
            <tr><td>PAYE Income Tax</td><td class="amount-col">${this.formatCurrency(data.deductions.payeTax, curr)}</td></tr>
            <tr><td>Employee Pension (8%)</td><td class="amount-col">${this.formatCurrency(data.deductions.pensionEmployee, curr)}</td></tr>
            <tr><td>National Housing Fund (2.5%)</td><td class="amount-col">${this.formatCurrency(data.deductions.nhf, curr)}</td></tr>
            <tr><td>Other Deductions / Union</td><td class="amount-col">${this.formatCurrency(data.deductions.otherDeductions, curr)}</td></tr>
            <tr class="total-row"><td>Total Deductions</td><td class="amount-col">${this.formatCurrency(data.deductions.totalDeductions, curr)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="net-box">
      <div>
        <div class="net-title">Net Take-Home Pay</div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">Employer Pension Contribution: ${this.formatCurrency(data.deductions.pensionEmployer, curr)}</div>
      </div>
      <div class="net-amount">${this.formatCurrency(data.netSalary, curr)}</div>
    </div>

    <div class="footer">
      This is an official computer-generated payslip issued by ${data.school.name}. No signature is required.
    </div>
  </div>
</body>
</html>`;
  }
}
