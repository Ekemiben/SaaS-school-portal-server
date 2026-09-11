import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationProviderAdapter,
  SendNotificationOptions,
  NotificationSendResult,
} from './notification-provider.interface.js';

@Injectable()
export class EmailAdapter implements NotificationProviderAdapter {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailAdapter.name);

  async send(options: SendNotificationOptions): Promise<NotificationSendResult> {
    this.logger.log(`[EmailAdapter] Sending email to ${options.recipient} for tenant ${options.tenantId}`);
    return {
      success: true,
      messageId: `msg_email_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      provider: 'smtp/ses',
      timestamp: new Date().toISOString(),
    };
  }
}
