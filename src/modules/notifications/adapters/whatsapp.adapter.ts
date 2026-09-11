import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationProviderAdapter,
  SendNotificationOptions,
  NotificationSendResult,
} from './notification-provider.interface.js';

@Injectable()
export class WhatsAppAdapter implements NotificationProviderAdapter {
  readonly channel = 'whatsapp' as const;
  private readonly logger = new Logger(WhatsAppAdapter.name);

  async send(options: SendNotificationOptions): Promise<NotificationSendResult> {
    this.logger.log(`[WhatsAppAdapter] Sending WhatsApp message to ${options.recipient} for tenant ${options.tenantId}`);
    return {
      success: true,
      messageId: `msg_wa_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      provider: 'whatsapp-business-api',
      timestamp: new Date().toISOString(),
    };
  }
}
