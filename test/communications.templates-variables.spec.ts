import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessageTemplateService } from '../src/modules/communications/services/message-template.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { TemplateCategory } from '../src/modules/communications/dto/template.dto.js';
import { CampaignChannel } from '../src/modules/communications/dto/campaign.dto.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 6 — Message Templates & Dynamic Variables Architecture', () => {
  let prisma: PrismaService;
  let templateService: MessageTemplateService;

  let tenantAlpha: string;
  let tenantBeta: string;
  let userAlpha: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_tmpl_alpha_${timestamp}`;
    tenantBeta = `tenant_tmpl_beta_${timestamp}`;
    userAlpha = `usr_alpha_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();

    templateService = new MessageTemplateService(prisma);

    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha Academy', slug: `alpha-${timestamp}` },
            { id: tenantBeta, name: 'Beta High', slug: `beta-${timestamp}` },
          ],
        });

        await prisma.user.create({
          data: {
            id: userAlpha,
            tenantId: tenantAlpha,
            email: `admin@alpha-${timestamp}.com`,
            passwordHash: 'hash',
            firstName: 'Admin',
            lastName: 'User',
          },
        });
      } catch (err: any) {
        console.warn(`Test DB setup error: ${err.message}`);
      }
    }
  });

  afterEach(async () => {
    if (prisma.isDbConnected) {
      try {
        await prisma.messageTemplateVersion.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.messageTemplate.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.user.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.tenant.deleteMany({
          where: { id: { in: [tenantAlpha, tenantBeta] } },
        });
      } catch (err: any) {
        console.warn(`Test DB teardown error: ${err.message}`);
      }
    }
    await prisma.$disconnect();
  });

  it('1. should list system default templates available for any tenant', async () => {
    const templates = await templateService.listTemplates(tenantAlpha);

    expect(templates.length).toBeGreaterThanOrEqual(3);
    const feeTemplate = templates.find((t) => t.category === TemplateCategory.FEE_REMINDER);
    expect(feeTemplate).toBeDefined();
    expect(feeTemplate?.isSystemDefault).toBe(true);
    expect(feeTemplate?.variables).toContain('studentName');
    expect(feeTemplate?.variables).toContain('amount');

    const emergencyTemplate = templates.find((t) => t.category === TemplateCategory.EMERGENCY_ALERT);
    expect(emergencyTemplate).toBeDefined();
  });

  it('2. should create a custom school template and automatically extract template variables', async () => {
    const custom = await templateService.createTemplate(
      tenantAlpha,
      {
        name: 'Inter-House Sports Invitation',
        category: TemplateCategory.GENERAL_ANNOUNCEMENT,
        channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL, CampaignChannel.WHATSAPP],
        subjectTemplate: 'Invitation to Inter-House Sports for {{parentName}}',
        bodyTemplate:
          'Dear {{parentName}}, you are cordially invited to our annual sports day cheering for {{studentName}} in {{houseName}} house on {{eventDate}} at {{venue}}.',
      },
      userAlpha,
    );

    expect(custom.id).toBeDefined();
    expect(custom.tenantId).toBe(tenantAlpha);
    expect(custom.isSystemDefault).toBe(false);
    expect(custom.currentVersion).toBe(1);

    // Verify variable extraction
    expect(custom.variables).toContain('parentName');
    expect(custom.variables).toContain('studentName');
    expect(custom.variables).toContain('houseName');
    expect(custom.variables).toContain('eventDate');
    expect(custom.variables).toContain('venue');

    // Verify template versions
    const versions = await templateService.getTemplateVersions(tenantAlpha, custom.id);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
  });

  it('3. should update template and record new version history', async () => {
    const created = await templateService.createTemplate(
      tenantAlpha,
      {
        name: 'Tuition Balance Notice',
        category: TemplateCategory.FEE_REMINDER,
        channels: [CampaignChannel.SMS, CampaignChannel.IN_APP],
        subjectTemplate: 'Fee Notice',
        bodyTemplate: 'Dear {{parentName}}, fee is ₦{{amount}}.',
      },
      userAlpha,
    );

    // Update the template
    const updated = await templateService.updateTemplate(
      tenantAlpha,
      created.id,
      {
        subjectTemplate: 'Urgent Tuition Notice for {{studentName}}',
        bodyTemplate:
          'Dear {{parentName}}, the outstanding fee for {{studentName}} is ₦{{amount}}. Payment due by {{dueDate}}.',
      },
      userAlpha,
      'Added dueDate and personalized student name',
    );

    expect(updated.currentVersion).toBe(2);
    expect(updated.variables).toContain('dueDate');
    expect(updated.variables).toContain('studentName');

    const versions = await templateService.getTemplateVersions(tenantAlpha, created.id);
    expect(versions.length).toBe(2);
    expect(versions[0].version).toBe(2);
    expect(versions[0].changeSummary).toContain('Added dueDate');
    expect(versions[1].version).toBe(1);
  });

  it('4. should render and preview templates with sample and dynamic variables', async () => {
    const template = await templateService.createTemplate(
      tenantAlpha,
      {
        name: 'Report Card Alert',
        category: TemplateCategory.RESULT_PUBLISHED,
        channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL],
        subjectTemplate: 'Report Card: {{studentName}} ({{term}})',
        bodyTemplate:
          'Dear {{parentName}}, {{studentName}} attained an average score of {{averageScore}}% in {{term}}.',
      },
      userAlpha,
    );

    const preview = await templateService.previewTemplate(tenantAlpha, template.id, {
      parentName: 'Mr. Babatunde',
      studentName: 'Kehinde Babatunde',
      term: 'Second Term',
      averageScore: '92.4',
    });

    expect(preview.subject).toBe('Report Card: Kehinde Babatunde (Second Term)');
    expect(preview.body).toBe(
      'Dear Mr. Babatunde, Kehinde Babatunde attained an average score of 92.4% in Second Term.',
    );
  });

  it('5. should prevent modifying or deleting system default templates', async () => {
    await expect(
      templateService.updateTemplate(tenantAlpha, 'tmpl_fee_reminder', {
        bodyTemplate: 'Attempted modification of system template',
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      templateService.deleteTemplate(tenantAlpha, 'tmpl_fee_reminder'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('6. should enforce multi-tenant isolation across custom templates', async () => {
    const alphaTemplate = await templateService.createTemplate(
      tenantAlpha,
      {
        name: 'Alpha Confidential Survey',
        category: TemplateCategory.GENERAL_ANNOUNCEMENT,
        channels: [CampaignChannel.IN_APP],
        subjectTemplate: 'Survey',
        bodyTemplate: 'Please participate in Alpha school survey.',
      },
      userAlpha,
    );

    // Beta tenant queries by ID -> Should throw NotFoundException
    await expect(
      templateService.getTemplateById(tenantBeta, alphaTemplate.id),
    ).rejects.toThrow(NotFoundException);

    // Beta tenant lists templates -> Alpha custom template NOT in Beta list
    const betaTemplates = await templateService.listTemplates(tenantBeta);
    expect(betaTemplates.some((t) => t.id === alphaTemplate.id)).toBe(false);

    // Beta tenant cannot update or delete Alpha template
    await expect(
      templateService.updateTemplate(tenantBeta, alphaTemplate.id, { name: 'Hacked' }),
    ).rejects.toThrow(NotFoundException);

    await expect(
      templateService.deleteTemplate(tenantBeta, alphaTemplate.id),
    ).rejects.toThrow(NotFoundException);
  });
});
