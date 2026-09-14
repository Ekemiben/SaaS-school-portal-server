import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CloudflareR2StorageProvider } from '../../files/storage.provider.js';

@Injectable()
export class AdmissionLetterRendererService {
  private readonly logger = new Logger(AdmissionLetterRendererService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: CloudflareR2StorageProvider,
  ) {}

  async renderOfferLetter(tenantId: string, offer: any, application: any): Promise<string> {
    const tenant = this.prisma.memoryStore.tenants.get(tenantId) || {
      name: 'School Portal Academy',
      primaryColor: '#1e3a8a',
      currency: 'NGN',
    };
    const campus = this.prisma.memoryStore.campuses.get(offer.campusId) || { name: 'Main Campus' };

    const formattedDate = new Date(offer.offerDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedDeadline = new Date(offer.acceptanceDeadline).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Provisional Offer of Admission - ${offer.offerNumber}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0 auto; max-width: 800px; line-height: 1.6; }
    .header { border-bottom: 3px solid ${tenant.primaryColor || '#1e3a8a'}; padding-bottom: 20px; margin-bottom: 30px; }
    .school-name { font-size: 24px; font-weight: bold; color: ${tenant.primaryColor || '#1e3a8a'}; margin: 0; }
    .campus-name { font-size: 14px; color: #64748b; margin: 5px 0 0; }
    .offer-title { font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 25px 0 15px; color: #0f172a; }
    .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .details-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .details-label { font-weight: 600; color: #475569; }
    .details-val { font-weight: 700; color: #0f172a; }
    .conditions { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="school-name">${tenant.name}</h1>
    <p class="campus-name">${campus.name}</p>
  </div>

  <p><strong>Date:</strong> ${formattedDate}</p>
  <p><strong>Ref:</strong> ${offer.offerNumber}</p>

  <p>Dear <strong>${application.parentFirstName} ${application.parentLastName}</strong>,</p>

  <h2 class="offer-title">PROVISIONAL OFFER OF ADMISSION</h2>

  <p>We are pleased to inform you that <strong>${application.studentFirstName} ${application.studentLastName}</strong> has been offered provisional admission into <strong>${tenant.name}</strong> for the upcoming academic session.</p>

  <div class="details-box">
    <div class="details-row"><span class="details-label">Application No:</span> <span class="details-val">${application.applicationNumber}</span></div>
    <div class="details-row"><span class="details-label">Offered Grade / Class:</span> <span class="details-val">${offer.offeredGradeLevel}</span></div>
    <div class="details-row"><span class="details-label">Campus:</span> <span class="details-val">${campus.name}</span></div>
    <div class="details-row"><span class="details-label">Acceptance Deadline:</span> <span class="details-val">${formattedDeadline}</span></div>
    ${offer.acceptanceFeeAmount > 0 ? `<div class="details-row"><span class="details-label">Acceptance Fee:</span> <span class="details-val">${tenant.currency || 'NGN'} ${offer.acceptanceFeeAmount.toLocaleString()}</span></div>` : ''}
  </div>

  ${offer.conditions ? `<div class="conditions"><strong>Conditions:</strong><br>${offer.conditions}</div>` : ''}

  <p>To accept this offer, please log in to the Admission Portal or contact the Admissions Office before <strong>${formattedDeadline}</strong>.</p>

  <p>Congratulations and welcome to our school community!</p>

  <div class="footer">
    <p>This is an official computer-generated document issued by ${tenant.name}.</p>
  </div>
</body>
</html>
    `.trim();

    const storageKey = `tenants/${tenantId}/admissions/offers/${offer.offerNumber}.html`;
    const buffer = Buffer.from(htmlContent, 'utf-8');

    try {
      if (this.storageProvider && typeof (this.storageProvider as any).uploadFile === 'function') {
        await (this.storageProvider as any).uploadFile(storageKey, buffer, 'text/html');
      }
    } catch (err: any) {
      this.logger.warn(`Storage upload warning: ${err.message}`);
    }

    const documentUrl = `https://storage.schoolportal.ng/${storageKey}`;
    this.logger.log(`Rendered admission offer letter for ${offer.offerNumber} -> ${documentUrl}`);
    return documentUrl;
  }
}
