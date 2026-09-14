import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateCategory,
} from '../dto/template.dto.js';
import { CampaignChannel } from '../dto/campaign.dto.js';
import { randomUUID } from 'crypto';

export interface MessageTemplateRecord {
  id: string;
  tenantId: string;
  name: string;
  category: TemplateCategory;
  channels: CampaignChannel[];
  subjectTemplate: string;
  bodyTemplate: string;
  variables: string[];
  isSystemDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MessageTemplateService {
  private readonly logger = new Logger(MessageTemplateService.name);
  private readonly fallbackTemplates: MessageTemplateRecord[] = [];

  constructor() {
    this.seedDefaultTemplates();
  }

  private seedDefaultTemplates() {
    const defaults = [
      {
        id: 'tmpl_fee_reminder',
        tenantId: 'GLOBAL',
        name: 'Standard Fee Reminder',
        category: TemplateCategory.FEE_REMINDER,
        channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL, CampaignChannel.WHATSAPP],
        subjectTemplate: 'School Fee Reminder for {{studentName}}',
        bodyTemplate: 'Dear {{parentName}}, this is a reminder that {{studentName}} has an outstanding fee balance of ₦{{amount}}. Please settle on or before {{dueDate}}.',
        variables: ['parentName', 'studentName', 'amount', 'dueDate'],
        isSystemDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tmpl_attendance_alert',
        tenantId: 'GLOBAL',
        name: 'Attendance Notification',
        category: TemplateCategory.ATTENDANCE_ALERT,
        channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.SMS],
        subjectTemplate: 'Attendance Alert: {{studentName}}',
        bodyTemplate: 'Dear {{parentName}}, please be informed that {{studentName}} was marked {{status}} on {{date}}.',
        variables: ['parentName', 'studentName', 'status', 'date'],
        isSystemDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tmpl_emergency_alert',
        tenantId: 'GLOBAL',
        name: 'Emergency Broadcast Alert',
        category: TemplateCategory.EMERGENCY_ALERT,
        channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.WHATSAPP, CampaignChannel.SMS, CampaignChannel.EMAIL],
        subjectTemplate: 'URGENT: {{title}}',
        bodyTemplate: 'EMERGENCY NOTICE: {{message}}. Please contact school management immediately.',
        variables: ['title', 'message'],
        isSystemDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    this.fallbackTemplates.push(...defaults);
  }

  async createTemplate(
    tenantId: string,
    dto: CreateTemplateDto,
  ): Promise<MessageTemplateRecord> {
    const id = `tmpl_${randomUUID().replace(/-/g, '').substring(0, 8)}`;
    const record: MessageTemplateRecord = {
      id,
      tenantId,
      name: dto.name,
      category: dto.category,
      channels: dto.channels,
      subjectTemplate: dto.subjectTemplate,
      bodyTemplate: dto.bodyTemplate,
      variables: dto.variables || this.extractVariables(dto.bodyTemplate),
      isSystemDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.fallbackTemplates.push(record);
    this.logger.log(`Created message template ${id} for tenant ${tenantId}`);
    return record;
  }

  async listTemplates(tenantId: string, category?: TemplateCategory): Promise<MessageTemplateRecord[]> {
    return this.fallbackTemplates.filter(
      (t) =>
        (t.tenantId === tenantId || t.tenantId === 'GLOBAL') &&
        (!category || t.category === category),
    );
  }

  async getTemplateById(tenantId: string, templateId: string): Promise<MessageTemplateRecord> {
    const template = this.fallbackTemplates.find(
      (t) => (t.tenantId === tenantId || t.tenantId === 'GLOBAL') && t.id === templateId,
    );
    if (!template) {
      throw new NotFoundException(`Message template ${templateId} not found`);
    }
    return template;
  }

  render(templateText: string, variables: Record<string, any>): string {
    if (!templateText) return '';
    return templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : `{{${key}}}`;
    });
  }

  private extractVariables(text: string): string[] {
    const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/[\{\}\s]/g, ''))));
  }
}
