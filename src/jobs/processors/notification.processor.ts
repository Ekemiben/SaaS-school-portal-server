import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapter } from '../../modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../../modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../../modules/notifications/adapters/whatsapp.adapter.js';

export interface NotificationJobData {
  channel: 'email' | 'sms' | 'whatsapp';
  tenantId: string;
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly emailAdapter: EmailAdapter,
    private readonly smsAdapter: SmsAdapter,
    private readonly whatsAppAdapter: WhatsAppAdapter,
  ) {}

  async process(job: { id: string; data: NotificationJobData }) {
    this.logger.log(`Processing notification job ${job.id} for tenant ${job.data.tenantId} via ${job.data.channel}`);
    const { channel, tenantId, recipient, subject, body, metadata } = job.data;

    switch (channel) {
      case 'email':
        return await this.emailAdapter.send({ recipient, subject, body, tenantId, metadata });
      case 'sms':
        return await this.smsAdapter.send({ recipient, body, tenantId, metadata });
      case 'whatsapp':
        return await this.whatsAppAdapter.send({ recipient, body, tenantId, metadata });
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }
}
