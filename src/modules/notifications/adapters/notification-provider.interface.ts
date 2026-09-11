export interface SendNotificationOptions {
  recipient: string;
  subject?: string;
  body: string;
  tenantId: string;
  metadata?: Record<string, any>;
}

export interface NotificationSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  timestamp: string;
  error?: string;
}

export interface NotificationProviderAdapter {
  readonly channel: 'email' | 'sms' | 'whatsapp';
  send(options: SendNotificationOptions): Promise<NotificationSendResult>;
}
