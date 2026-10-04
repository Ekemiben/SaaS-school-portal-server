import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

const DEFAULT_TEMPLATES = [
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

@Injectable()
export class MessageTemplateService {
  private readonly logger = new Logger(MessageTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTemplate(
    tenantId: string,
    dto: CreateTemplateDto,
    userId?: string,
  ): Promise<MessageTemplateRecord> {
    const now = new Date();
    const id = `tmpl_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const variables = dto.variables && dto.variables.length > 0
      ? Array.from(new Set([...dto.variables, ...this.extractVariables(`${dto.subjectTemplate || ''} ${dto.bodyTemplate}`)]))
      : this.extractVariables(`${dto.subjectTemplate || ''} ${dto.bodyTemplate}`);

    const existing = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`A template named "${dto.name}" already exists for this school`);
    }

    const created = await this.prisma.messageTemplate.create({
      data: {
        id,
        tenantId,
        name: dto.name,
        category: dto.category,
        channels: (dto.channels || [CampaignChannel.IN_APP, CampaignChannel.PUSH]) as any,
        subjectTemplate: dto.subjectTemplate || null,
        bodyTemplate: dto.bodyTemplate,
        variables,
        isSystemDefault: false,
        isActive: true,
        currentVersion: 1,
      },
    });

    await this.prisma.messageTemplateVersion.create({
      data: {
        id: `ver_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
        templateId: created.id,
        tenantId,
        version: 1,
        subjectTemplate: created.subjectTemplate,
        bodyTemplate: created.bodyTemplate,
        variables: (created.variables as any) || [],
        changedByUserId: userId || null,
        changeSummary: 'Initial template creation',
      },
    });

    this.logger.log(`Created message template ${id} for tenant ${tenantId}`);
    return {
      id: created.id,
      tenantId: created.tenantId,
      name: created.name,
      category: created.category as any,
      channels: created.channels as any,
      subjectTemplate: created.subjectTemplate,
      bodyTemplate: created.bodyTemplate,
      variables: created.variables as any,
      isSystemDefault: created.isSystemDefault,
      isActive: created.isActive,
      currentVersion: created.currentVersion,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    dto: UpdateTemplateDto,
    userId?: string,
    changeSummary?: string,
  ): Promise<MessageTemplateRecord> {
    const existing = await this.getTemplateById(tenantId, templateId);

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

    const updated = await this.prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name || existing.name,
        category: dto.category || existing.category,
        channels: (dto.channels || existing.channels) as any,
        subjectTemplate: subjectTemplate || null,
        bodyTemplate,
        variables,
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
        subjectTemplate: updated.subjectTemplate,
        bodyTemplate: updated.bodyTemplate,
        variables: (updated.variables as any) || [],
        changedByUserId: userId || null,
        changeSummary: changeSummary || 'Template updated',
      },
    });

    this.logger.log(`Updated template ${templateId} to version ${newVersion} for tenant ${tenantId}`);
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      name: updated.name,
      category: updated.category as any,
      channels: updated.channels as any,
      subjectTemplate: updated.subjectTemplate,
      bodyTemplate: updated.bodyTemplate,
      variables: updated.variables as any,
      isSystemDefault: updated.isSystemDefault,
      isActive: updated.isActive,
      currentVersion: updated.currentVersion,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async listTemplates(
    tenantId: string,
    category?: TemplateCategory,
    channel?: CampaignChannel,
  ): Promise<MessageTemplateRecord[]> {
    const where: any = {
      OR: [{ tenantId }, { tenantId: null }, { isSystemDefault: true }],
      isActive: true,
    };
    if (category) where.category = category;

    const rows = await this.prisma.messageTemplate.findMany({
      where,
      orderBy: [{ isSystemDefault: 'asc' }, { createdAt: 'desc' }],
    });

    let results: MessageTemplateRecord[] = rows.map((r) => ({
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

    // If database does not have defaults yet, include built-in default templates
    for (const sys of DEFAULT_TEMPLATES) {
      if (!results.some((t) => t.id === sys.id || (t.isSystemDefault && t.category === sys.category))) {
        results.push({
          ...sys,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (category) {
      results = results.filter((t) => t.category === category);
    }
    if (channel) {
      results = results.filter((t) => t.channels?.includes(channel));
    }

    return results;
  }

  async getTemplateById(tenantId: string, templateId: string): Promise<MessageTemplateRecord> {
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

    const fallback = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    if (fallback) {
      return {
        ...fallback,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    throw new NotFoundException(`Message template ${templateId} not found`);
  }

  async getTemplateVersions(tenantId: string, templateId: string): Promise<MessageTemplateVersionRecord[]> {
    await this.getTemplateById(tenantId, templateId); // verify access

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
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<{ success: boolean; id: string }> {
    const template = await this.getTemplateById(tenantId, templateId);
    if (template.isSystemDefault || template.tenantId === null) {
      throw new ForbiddenException('Cannot delete system default templates');
    }
    if (template.tenantId !== tenantId) {
      throw new NotFoundException(`Message template ${templateId} not found`);
    }

    await this.prisma.messageTemplate.delete({
      where: { id: templateId },
    });

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
