export interface ReceiptRenderData {
  receiptNumber: string;
  issuedAt: string;
  school: {
    name: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    email?: string;
    primaryColor?: string;
  };
  student: {
    fullName: string;
    admissionNumber: string;
    className?: string;
  };
  parent?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  payment: {
    id: string;
    reference: string;
    transactionId: string;
    amount: number;
    currency: string;
    provider: string;
    channel?: string;
    status: string;
    paidAt: string;
  };
  invoice: {
    invoiceNumber: string;
    subtotal: number;
    discountAmount: number;
    waiverAmount: number;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    dueDate?: string;
  };
  securityHash: string;
}

export class ReceiptRenderer {
  private static formatMoney(amount: number, currency: string = 'NGN'): string {
    const symbol = currency === 'NGN' ? '₦' : currency + ' ';
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  static renderHtml(data: ReceiptRenderData): string {
    const primaryColor = data.school.primaryColor || '#059669'; // emerald theme for receipts
    const curr = data.payment.currency || 'NGN';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Official Payment Receipt - ${data.receiptNumber}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; line-height: 1.5; font-size: 13px; }
    .receipt-box { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${primaryColor}; padding-bottom: 16px; margin-bottom: 20px; }
    .school-title { font-size: 20px; font-weight: 800; color: ${primaryColor}; text-transform: uppercase; margin: 0 0 4px 0; }
    .paid-stamp { border: 2px dashed ${primaryColor}; color: ${primaryColor}; font-weight: 900; font-size: 18px; padding: 6px 16px; border-radius: 6px; text-transform: uppercase; letter-spacing: 2px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; }
    .info-card h3 { margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 11px; padding: 10px; border: 1px solid #cbd5e1; }
    .receipt-summary { width: 380px; margin-left: auto; margin-bottom: 24px; }
    .receipt-summary td { padding: 6px 10px; }
    .security-badge { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; font-size: 11px; color: #166534; margin-top: 16px; word-break: break-all; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="receipt-box">
    <div class="header">
      <div>
        <h1 class="school-title">${data.school.name}</h1>
        <p style="margin: 0; color: #64748b; font-size: 12px;">${data.school.address || 'Academic Bursary & Accounts Department'}</p>
        <p style="margin: 2px 0 0 0; color: #64748b; font-size: 12px;">Phone: ${data.school.phone || '+234 800 111 2222'} | Email: ${data.school.email || 'bursary@school.edu.ng'}</p>
      </div>
      <div style="text-align: right;">
        <div class="paid-stamp">PAYMENT RECEIVED</div>
        <div style="font-family: monospace; font-size: 12px; font-weight: bold; color: #475569; margin-top: 6px;">${data.receiptNumber}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="info-card">
        <h3>Student Information</h3>
        <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${data.student.fullName}</div>
        <div style="font-size: 12px; color: #475569;">Admission No: <strong>${data.student.admissionNumber}</strong></div>
        ${data.student.className ? `<div style="font-size: 12px; color: #475569;">Class: <strong>${data.student.className}</strong></div>` : ''}
      </div>
      <div class="info-card">
        <h3>Payment & Transaction</h3>
        <div style="font-size: 12px; color: #475569;">Date Paid: <strong>${data.payment.paidAt}</strong></div>
        <div style="font-size: 12px; color: #475569;">Reference: <strong>${data.payment.reference}</strong></div>
        <div style="font-size: 12px; color: #475569;">Channel: <strong>${data.payment.provider} (${data.payment.channel || 'ONLINE'})</strong></div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Description</th>
          <th style="width: 140px; text-align: center;">Invoice Ref</th>
          <th style="width: 140px; text-align: right;">Amount Paid</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 600;">School Fees & Academic Levies Payment</td>
          <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${data.invoice.invoiceNumber}</td>
          <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #059669; font-size: 14px;">${this.formatMoney(data.payment.amount, curr)}</td>
        </tr>
      </tbody>
    </table>

    <table class="receipt-summary">
      <tr>
        <td style="color: #64748b;">Total Invoice Billed:</td>
        <td style="text-align: right; font-weight: 600;">${this.formatMoney(data.invoice.totalAmount, curr)}</td>
      </tr>
      <tr>
        <td style="color: #64748b;">Cumulative Paid:</td>
        <td style="text-align: right; font-weight: 600; color: #059669;">${this.formatMoney(data.invoice.paidAmount, curr)}</td>
      </tr>
      <tr style="border-top: 2px solid #cbd5e1; font-size: 14px;">
        <td style="font-weight: 800; color: ${data.invoice.balanceAmount === 0 ? '#059669' : '#dc2626'}; padding-top: 8px;">Outstanding Balance:</td>
        <td style="text-align: right; font-weight: 800; color: ${data.invoice.balanceAmount === 0 ? '#059669' : '#dc2626'}; padding-top: 8px;">${this.formatMoney(data.invoice.balanceAmount, curr)}</td>
      </tr>
    </table>

    <div class="security-badge">
      <strong>🔒 Cryptographic Tamper-Proof Audit Stamp:</strong><br/>
      <span style="font-family: monospace; font-size: 10px;">${data.securityHash}</span>
    </div>

    <div class="footer">
      <div>This is an official system-generated receipt issued by ${data.school.name}. Valid without physical signature.</div>
      <div style="margin-top: 4px;">Multi-Tenant School Management Platform • Issued ${data.issuedAt}</div>
    </div>
  </div>
</body>
</html>`;
  }
}
