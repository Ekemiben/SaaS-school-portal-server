export interface InvoiceRenderData {
  school: {
    name: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
    primaryColor?: string;
  };
  student: {
    fullName: string;
    admissionNumber: string;
    className: string;
    gender?: string;
  };
  parent?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    issuedAt: string;
    dueDate: string;
    subtotal: number;
    discountAmount: number;
    waiverAmount: number;
    latePenaltyAmount: number;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    currency: string;
    notes?: string;
    lineItems: Array<{
      name: string;
      code: string;
      category?: string;
      amount: number;
      isIncluded?: boolean;
    }>;
  };
}

export class InvoiceRenderer {
  private static formatMoney(amount: number, currency: string = 'NGN'): string {
    const symbol = currency === 'NGN' ? '₦' : currency + ' ';
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  static renderHtml(data: InvoiceRenderData): string {
    const curr = data.invoice.currency || data.school.currency || 'NGN';
    const primaryColor = data.school.primaryColor || '#1e3a8a';

    const lineItemRows = (data.invoice.lineItems || [])
      .filter((it) => it.isIncluded !== false)
      .map((it, idx) => `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: 600;">${it.name} <span style="font-size: 11px; color: #64748b;">(${it.code})</span></td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #475569; font-size: 11px;">${it.category || 'FEE'}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${this.formatMoney(it.amount, curr)}</td>
        </tr>`)
      .join('');

    const statusColor = data.invoice.status === 'PAID' ? '#16a34a' : data.invoice.status === 'PARTIALLY_PAID' ? '#d97706' : '#dc2626';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${data.invoice.invoiceNumber} - ${data.student.fullName}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; line-height: 1.5; font-size: 13px; }
    .invoice-box { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 24px; }
    .school-title { font-size: 22px; font-weight: 800; color: ${primaryColor}; text-transform: uppercase; margin: 0 0 4px 0; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
    .info-card h3 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 10px; border: 1px solid #cbd5e1; }
    .summary-table { width: 350px; margin-left: auto; margin-bottom: 24px; }
    .summary-table td { padding: 6px 10px; }
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; color: white; background: ${statusColor}; font-weight: bold; font-size: 11px; text-transform: uppercase; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="header">
      <div>
        <h1 class="school-title">${data.school.name}</h1>
        <p style="margin: 0; color: #64748b; font-size: 12px;">${data.school.address || 'Academic Excellence & Leadership'}</p>
        <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">Phone: ${data.school.phone || '+234 800 111 2222'} | Email: ${data.school.email || 'bursar@school.edu.ng'}</p>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 18px; font-weight: 800; color: #0f172a;">INVOICE</div>
        <div style="font-family: monospace; font-size: 13px; font-weight: bold; color: ${primaryColor}; margin: 2px 0 6px 0;">${data.invoice.invoiceNumber}</div>
        <div><span class="status-badge">${data.invoice.status}</span></div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="info-card">
        <h3>Billed To (Student)</h3>
        <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${data.student.fullName}</div>
        <div style="font-size: 12px; color: #475569;">Admission No: <strong>${data.student.admissionNumber}</strong></div>
        <div style="font-size: 12px; color: #475569;">Class: <strong>${data.student.className}</strong></div>
      </div>
      <div class="info-card">
        <h3>Invoice Details</h3>
        <div style="font-size: 12px; color: #475569;">Issue Date: <strong>${data.invoice.issuedAt}</strong></div>
        <div style="font-size: 12px; color: #475569;">Due Date: <strong style="color: #dc2626;">${data.invoice.dueDate}</strong></div>
        ${data.parent?.name ? `<div style="font-size: 12px; color: #475569;">Guardian: <strong>${data.parent.name}</strong> (${data.parent.phone || '-'})</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Item Description</th>
          <th style="width: 120px; text-align: center;">Category</th>
          <th style="width: 130px; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows}
      </tbody>
    </table>

    <table class="summary-table">
      <tr>
        <td style="color: #64748b;">Subtotal:</td>
        <td style="text-align: right; font-weight: 600;">${this.formatMoney(data.invoice.subtotal, curr)}</td>
      </tr>
      ${data.invoice.discountAmount > 0 ? `
      <tr>
        <td style="color: #16a34a;">Discounts & Sibling Aid:</td>
        <td style="text-align: right; color: #16a34a; font-weight: 600;">-${this.formatMoney(data.invoice.discountAmount, curr)}</td>
      </tr>` : ''}
      ${data.invoice.waiverAmount > 0 ? `
      <tr>
        <td style="color: #2563eb;">Scholarship / Waiver:</td>
        <td style="text-align: right; color: #2563eb; font-weight: 600;">-${this.formatMoney(data.invoice.waiverAmount, curr)}</td>
      </tr>` : ''}
      ${data.invoice.latePenaltyAmount > 0 ? `
      <tr>
        <td style="color: #dc2626;">Late Fee Penalty:</td>
        <td style="text-align: right; color: #dc2626; font-weight: 600;">+${this.formatMoney(data.invoice.latePenaltyAmount, curr)}</td>
      </tr>` : ''}
      <tr style="border-top: 2px solid #cbd5e1; font-size: 15px;">
        <td style="font-weight: 800; color: #0f172a; padding-top: 8px;">Total Payable:</td>
        <td style="text-align: right; font-weight: 800; color: ${primaryColor}; padding-top: 8px;">${this.formatMoney(data.invoice.totalAmount, curr)}</td>
      </tr>
      <tr>
        <td style="color: #64748b;">Paid Amount:</td>
        <td style="text-align: right; font-weight: 600; color: #16a34a;">${this.formatMoney(data.invoice.paidAmount, curr)}</td>
      </tr>
      <tr style="border-top: 1px solid #e2e8f0; font-size: 14px;">
        <td style="font-weight: 800; color: #dc2626;">Outstanding Balance:</td>
        <td style="text-align: right; font-weight: 800; color: #dc2626;">${this.formatMoney(data.invoice.balanceAmount, curr)}</td>
      </tr>
    </table>

    <div class="footer">
      <div>Thank you for choosing ${data.school.name}. For questions regarding this invoice, contact the Bursary at ${data.school.email || 'finance@school.edu.ng'}.</div>
      <div style="margin-top: 4px;">System Generated on ${new Date().toLocaleDateString()} • Multi-Tenant School SaaS</div>
    </div>
  </div>
</body>
</html>`;
  }
}
