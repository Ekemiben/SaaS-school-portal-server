import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationProviderAdapter,
  SendNotificationOptions,
  NotificationSendResult,
} from './notification-provider.interface.js';

@Injectable()
export class SmsAdapter implements NotificationProviderAdapter {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(SmsAdapter.name);

  async send(options: SendNotificationOptions): Promise<NotificationSendResult> {
    this.logger.log(`[SmsAdapter] Sending SMS to ${options.recipient} for tenant ${options.tenantId}`);
    return {
      success: true,
      messageId: `msg_sms_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      provider: 'termii/twilio',
      timestamp: new Date().toISOString(),
    };
  }
}
