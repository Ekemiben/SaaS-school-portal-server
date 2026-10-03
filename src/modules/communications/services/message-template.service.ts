import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateCategory,
} from '../dto/template.dto.js';
import { CampaignChannel } from '../dto/campaign.dto.js';
import { randomUUID } from 'crypto';

export interface MessageTemplateRecord {
  id: string;
  tenantId: string | null;
  name: string;
  category: TemplateCategory;
  channels: CampaignChannel[];
  subjectTemplate: string | null;
  bodyTemplate: string;
  variables: string[];
  isSystemDefault: boolean;
  isActive: boolean;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplateVersionRecord {
  id: string;
  templateId: string;
  tenantId: string | null;
  version: number;
  subjectTemplate: string | null;
  bodyTemplate: string;
  variables: string[];
  changedByUserId?: string | null;
  changeSummary?: string | null;
  createdAt: string;
}

@Injectable()
export class MessageTemplateService {
  private readonly logger = new Logger(MessageTemplateService.name);
  private readonly fallbackTemplates: MessageTemplateRecord[] = [];
  private readonly fallbackVersions: MessageTemplateVersionRecord[] = [];
  private readonly localTemplates = new Map<string, any>();
  private readonly localVersions = new Map<string, any>();

  constructor(@Optional() private readonly prisma?: PrismaService) {
    this.seedDefaultTemplates();
  }

  private getTemplatesMap(): Map<string, any> {
    return this.prisma?.memoryStore?.messageTemplates || this.localTemplates;
  }

  private getVersionsMap(): Map<string, any> {
    return (this.prisma?.memoryStore as any)?.messageTemplateVersions || this.localVersions;
  }

  private seedDefaultTemplates() {
    const defaults: Array<Omit<MessageTemplateRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }> = [
      {
        id: 'tmpl_fee_reminder',
        tenantId: null,
        name: 'Standard Fee Reminder',
        category: TemplateCategory.FEE_REMINDER,
        channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL, CampaignChannel.WHATSAPP],
        subjectTemplate: 'School Fee Reminder for {{studentName}}',
        bodyTemplate: 'Dear {{parentName}}, this is a reminder that {{studentName}} has an outstanding fee balance of ₦{{amount}}. Please settle on or before {{dueDate}}.',
        variables: ['parentName', 'studentName', 'amount', 'dueDate'],
        isSystemDefault: true,
        isActive: true,
        currentVersion: 1,
      },
      {
        id: 'tmpl_attendance_alert',
        tenantId: null,
        name: 'Attendance Notification',
        category: TemplateCategory.ATTENDANCE_ALERT,
        channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.SMS],
        subjectTemplate: 'Attendance Alert: {{studentName}}',
        bodyTemplate: 'Dear {{parentName}}, please be informed that {{studentName}} was marked {{status}} on {{date}}.',
        variables: ['parentName', 'studentName', 'status', 'date'],
        isSystemDefault: true,
        isActive: true,
        currentVersion: 1,
      },
      {
        id: 'tmpl_emergency_alert',
        tenantId: null,
        name: 'Emergency Broadcast Alert',
        category: TemplateCategory.EMERGENCY_ALERT,
        channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.WHATSAPP, CampaignChannel.SMS, CampaignChannel.EMAIL],
        subjectTemplate: 'URGENT: {{title}}',
        bodyTemplate: 'EMERGENCY NOTICE: {{message}}. Please contact school management immediately.',
        variables: ['title', 'message'],
        isSystemDefault: true,
        isActive: true,
        currentVersion: 1,
      },
      {
        id: 'tmpl_result_published',
        tenantId: null,
        name: 'Examination Result Published',
        category: TemplateCategory.RESULT_PUBLISHED,
        channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL, CampaignChannel.SMS],
        subjectTemplate: 'Exam Results Released: {{studentName}} ({{term}})',
        bodyTemplate: 'Dear {{parentName}}, the exam results for {{studentName}} for {{term}} {{session}} have been published. Average score: {{averageScore}}%. Please log in to view the full report card.',
        variables: ['parentName', 'studentName', 'term', 'session', 'averageScore'],
        isSystemDefault: true,
        isActive: true,
        currentVersion: 1,
      },
      {
        id: 'tmpl_homework_notice',
        tenantId: null,
        name: 'New Homework Assignment',
        category: TemplateCategory.HOMEWORK_NOTICE,
        channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL],
        subjectTemplate: 'New Homework: {{subjectName}} - {{title}}',
        bodyTemplate: 'Dear {{studentName}}, new homework for {{subjectName}} ("{{title}}") has been assigned. Due date: {{dueDate}}.',
        variables: ['studentName', 'subjectName', 'title', 'dueDate'],
        isSystemDefault: true,
        isActive: true,
        currentVersion: 1,
      },
      {
        id: 'tmpl_transport_alert',
        tenantId: null,
        name: 'School Bus Transit Update',
        category: TemplateCategory.TRANSPORT_ALERT,
        channels: [CampaignChannel.IN_APP, CampaignChannel.SMS, CampaignChannel.WHATSAPP],
        subjectTemplate: 'Transport Alert: Route {{routeName}}',
        bodyTemplate: 'Dear {{parentName}}, the school bus for route {{routeName}} carrying {{studentName}} has status: {{status}}. Estimated arrival: {{eta}}.',
        variables: ['parentName', 'studentName', 'routeName', 'status', 'eta'],
        isSystemDefault: true,
        isActive: true,
        currentVersion: 1,
      },
    ];

    const now = new Date().toISOString();
    for (const d of defaults) {
      const rec: MessageTemplateRecord = {
        ...d,
        createdAt: now,
        updatedAt: now,
      };
      this.fallbackTemplates.push(rec);
      this.fallbackVersions.push({
        id: `ver_${d.id}_1`,
        templateId: d.id,
        tenantId: null,
        version: 1,
        subjectTemplate: d.subjectTemplate,
        bodyTemplate: d.bodyTemplate,
        variables: d.variables,
        changeSummary: 'System default template',
        createdAt: now,
      });
    }
  }

  async createTemplate(
    tenantId: string,
    dto: CreateTemplateDto,
    userId?: string,
  ): Promise<MessageTemplateRecord> {
    const id = `tmpl_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = new Date();
    const variables = dto.variables && dto.variables.length > 0
      ? Array.from(new Set([...dto.variables, ...this.extractVariables(`${dto.subjectTemplate || ''} ${dto.bodyTemplate}`)]))
      : this.extractVariables(`${dto.subjectTemplate || ''} ${dto.bodyTemplate}`);

    const record: MessageTemplateRecord = {
      id,
      tenantId,
      name: dto.name,
      category: dto.category,
      channels: dto.channels,
      subjectTemplate: dto.subjectTemplate || null,
      bodyTemplate: dto.bodyTemplate,
      variables,
      isSystemDefault: false,
      isActive: true,
      currentVersion: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (this.prisma?.isDbConnected) {
      try {
        const existing = await this.prisma.messageTemplate.findFirst({
          where: { tenantId, name: dto.name },
        });
        if (existing) {
          throw new BadRequestException(`A template named "${dto.name}" already exists for this school`);
        }

        await this.prisma.messageTemplate.create({
          data: {
            id: record.id,
            tenantId: record.tenantId,
            name: record.name,
            category: record.category,
            channels: record.channels as any,
            subjectTemplate: record.subjectTemplate,
            bodyTemplate: record.bodyTemplate,
            variables: record.variables,
            isSystemDefault: false,
            isActive: true,
            currentVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
        });

        await this.prisma.messageTemplateVersion.create({
          data: {
            id: `ver_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            templateId: record.id,
            tenantId: record.tenantId,
            version: 1,
            subjectTemplate: record.subjectTemplate,
            bodyTemplate: record.bodyTemplate,
            variables: record.variables,
            changedByUserId: userId || null,
            changeSummary: 'Initial template creation',
            createdAt: now,
          },
        });
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Could not save message template to DB: ${err.message}`);
      }
    }

    this.getTemplatesMap().set(record.id, record);
    this.logger.log(`Created message template ${id} for tenant ${tenantId}`);
    return record;
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    dto: UpdateTemplateDto,
    userId?: string,
    changeSummary?: string,
  ): Promise<MessageTemplateRecord> {
    const existing = await this.getTemplateById(tenantId, templateId);
    if (!existing) {
      throw new NotFoundException(`Message template ${templateId} not found`);
    }

    if (existing.isSystemDefault || existing.tenantId === null) {
      throw new ForbiddenException('System default templates cannot be modified directly. Please create a custom template for your school.');
    }

    if (existing.tenantId !== tenantId) {
      throw new NotFoundException(`Message template ${templateId} not found`);
    }

    const now = new Date();
    const newVersion = existing.currentVersion + 1;
    const subjectTemplate = dto.subjectTemplate !== undefined ? dto.subjectTemplate : existing.subjectTemplate;
    const bodyTemplate = dto.bodyTemplate !== undefined ? dto.bodyTemplate : existing.bodyTemplate;
    const variables = dto.variables && dto.variables.length > 0
      ? Array.from(new Set([...dto.variables, ...this.extractVariables(`${subjectTemplate || ''} ${bodyTemplate}`)]))
      : this.extractVariables(`${subjectTemplate || ''} ${bodyTemplate}`);

    const updatedRecord: MessageTemplateRecord = {
      ...existing,
      name: dto.name || existing.name,
      category: dto.category || existing.category,
      channels: dto.channels || existing.channels,
      subjectTemplate: subjectTemplate || null,
      bodyTemplate,
      variables,
      currentVersion: newVersion,
      updatedAt: now.toISOString(),
    };

    if (this.prisma?.isDbConnected) {
      try {
        await this.prisma.messageTemplate.update({
          where: { id: templateId },
          data: {
            name: updatedRecord.name,
            category: updatedRecord.category,
            channels: updatedRecord.channels as any,
            subjectTemplate: updatedRecord.subjectTemplate,
            bodyTemplate: updatedRecord.bodyTemplate,
            variables: updatedRecord.variables,
            currentVersion: newVersion,
            updatedAt: now,
          },
        });

        await this.prisma.messageTemplateVersion.create({
          data: {
            id: `ver_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
            templateId,
            tenantId,
            version: newVersion,
            subjectTemplate: updatedRecord.subjectTemplate,
            bodyTemplate: updatedRecord.bodyTemplate,
            variables: updatedRecord.variables,
            changedByUserId: userId || null,
            changeSummary: changeSummary || 'Template updated',
            createdAt: now,
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not update message template in DB: ${err.message}`);
      }
    }

    this.getTemplatesMap().set(templateId, updatedRecord);
    this.logger.log(`Updated template ${templateId} to version ${newVersion} for tenant ${tenantId}`);
    return updatedRecord;
  }

  async listTemplates(
    tenantId: string,
    category?: TemplateCategory,
    channel?: CampaignChannel,
  ): Promise<MessageTemplateRecord[]> {
    let dbTemplates: MessageTemplateRecord[] = [];
    if (this.prisma?.isDbConnected) {
      try {
        const where: any = {
          OR: [{ tenantId }, { tenantId: null }, { isSystemDefault: true }],
          isActive: true,
        };
        if (category) where.category = category;

        const rows = await this.prisma.messageTemplate.findMany({
          where,
          orderBy: [{ isSystemDefault: 'asc' }, { createdAt: 'desc' }],
        });

        dbTemplates = rows.map((r) => ({
          id: r.id,
          tenantId: r.tenantId,
          name: r.name,
          category: r.category as any,
          channels: r.channels as any,
          subjectTemplate: r.subjectTemplate,
          bodyTemplate: r.bodyTemplate,
          variables: r.variables as any,
          isSystemDefault: r.isSystemDefault,
          isActive: r.isActive,
          currentVersion: r.currentVersion,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));
      } catch (err: any) {
        this.logger.warn(`Could not load templates from DB: ${err.message}`);
      }
    }

    // Memory Store custom templates
    const customMemory = Array.from(this.getTemplatesMap().values()).filter(
      (t: MessageTemplateRecord) => t.tenantId === tenantId && t.isActive !== false,
    );

    // Merge DB + memory + system defaults
    const combined = [...dbTemplates];
    for (const mem of customMemory) {
      if (!combined.some((t) => t.id === mem.id)) {
        combined.push(mem);
      }
    }
    for (const sys of this.fallbackTemplates.filter((t) => t.isSystemDefault)) {
      if (!combined.some((t) => t.id === sys.id || (t.isSystemDefault && t.category === sys.category))) {
        combined.push(sys);
      }
    }

    let filtered = combined;
    if (category) {
      filtered = filtered.filter((t) => t.category === category);
    }
    if (channel) {
      filtered = filtered.filter((t) => t.channels?.includes(channel));
    }

    return filtered;
  }

  async getTemplateById(tenantId: string, templateId: string): Promise<MessageTemplateRecord> {
    if (this.prisma?.isDbConnected) {
      try {
        const r = await this.prisma.messageTemplate.findFirst({
          where: {
            id: templateId,
            OR: [{ tenantId }, { tenantId: null }, { isSystemDefault: true }],
          },
        });
        if (r) {
          return {
            id: r.id,
            tenantId: r.tenantId,
            name: r.name,
            category: r.category as any,
            channels: r.channels as any,
            subjectTemplate: r.subjectTemplate,
            bodyTemplate: r.bodyTemplate,
            variables: r.variables as any,
            isSystemDefault: r.isSystemDefault,
            isActive: r.isActive,
            currentVersion: r.currentVersion,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch template from DB: ${err.message}`);
      }
    }

    const fallback = this.fallbackTemplates.find(
      (t) => (t.tenantId === tenantId || t.tenantId === null || t.isSystemDefault) && t.id === templateId,
    );
    if (fallback) {
      return fallback;
    }

    const mem = this.getTemplatesMap().get(templateId);
    if (mem && (mem.tenantId === tenantId || mem.tenantId === null || mem.isSystemDefault)) {
      return mem;
    }

    throw new NotFoundException(`Message template ${templateId} not found`);
  }

  async getTemplateVersions(tenantId: string, templateId: string): Promise<MessageTemplateVersionRecord[]> {
    await this.getTemplateById(tenantId, templateId); // verify access

    if (this.prisma?.isDbConnected) {
      try {
        const rows = await this.prisma.messageTemplateVersion.findMany({
          where: { templateId },
          orderBy: { version: 'desc' },
        });
        return rows.map((v) => ({
          id: v.id,
          templateId: v.templateId,
          tenantId: v.tenantId,
          version: v.version,
          subjectTemplate: v.subjectTemplate,
          bodyTemplate: v.bodyTemplate,
          variables: v.variables as any,
          changedByUserId: v.changedByUserId,
          changeSummary: v.changeSummary,
          createdAt: v.createdAt.toISOString(),
        }));
      } catch (err: any) {
        this.logger.warn(`Could not load template versions from DB: ${err.message}`);
      }
    }

    return this.fallbackVersions
      .filter((v) => v.templateId === templateId)
      .sort((a, b) => b.version - a.version);
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<{ success: boolean; id: string }> {
    const template = await this.getTemplateById(tenantId, templateId);
    if (template.isSystemDefault || template.tenantId === null) {
      throw new ForbiddenException('Cannot delete system default templates');
    }
    if (template.tenantId !== tenantId) {
      throw new NotFoundException(`Message template ${templateId} not found`);
    }

    if (this.prisma?.isDbConnected) {
      try {
        await this.prisma.messageTemplate.delete({
          where: { id: templateId },
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete template from DB: ${err.message}`);
      }
    }

    this.getTemplatesMap().delete(templateId);
    return { success: true, id: templateId };
  }

  render(templateText: string, variables: Record<string, any>): string {
    if (!templateText) return '';
    return templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : `{{${key}}}`;
    });
  }

  async previewTemplate(
    tenantId: string,
    templateId: string,
    sampleVariables?: Record<string, any>,
  ): Promise<{ subject: string; body: string; variables: string[] }> {
    const template = await this.getTemplateById(tenantId, templateId);
    const defaults: Record<string, string> = {
      parentName: 'Mrs. Folake Adeleke',
      studentName: 'Tobi Adeleke',
      amount: '85,000',
      dueDate: '15th October 2026',
      status: 'ABSENT',
      date: new Date().toLocaleDateString('en-GB'),
      title: 'Emergency Advisory',
      message: 'School operations are temporarily suspended due to national holiday.',
      term: 'First Term',
      session: '2026/2027',
      averageScore: '88.5',
      subjectName: 'Mathematics',
      routeName: 'Lekki-Ajah Route 1',
      eta: '4:15 PM',
    };

    const mergedVars = { ...defaults, ...(sampleVariables || {}) };
    const renderedSubject = this.render(template.subjectTemplate || '', mergedVars);
    const renderedBody = this.render(template.bodyTemplate, mergedVars);

    return {
      subject: renderedSubject,
      body: renderedBody,
      variables: template.variables,
    };
  }

  public extractVariables(text: string): string[] {
    const matches = text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/[\{\}\s]/g, ''))));
  }
}
