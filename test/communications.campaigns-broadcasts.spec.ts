import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CampaignService } from '../src/modules/communications/services/campaign.service.js';
import { AudienceService } from '../src/modules/communications/services/audience.service.js';
import { MessageTemplateService } from '../src/modules/communications/services/message-template.service.js';
import { CommunicationPolicyService } from '../src/modules/communications/services/communication-policy.service.js';
import { CommunicationWalletService } from '../src/modules/communications/services/communication-wallet.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  CampaignChannel,
  CampaignPriority,
  CampaignStatus,
} from '../src/modules/communications/dto/campaign.dto.js';
import { AudienceType } from '../src/modules/communications/dto/audience.dto.js';

describe('Phase 4 — Campaigns & Omnichannel Broadcast Architecture', () => {
  let prisma: PrismaService;
  let audienceService: AudienceService;
  let templateService: MessageTemplateService;
  let policyService: CommunicationPolicyService;
  let walletService: CommunicationWalletService;
  let notificationsService: NotificationsService;
  let campaignService: CampaignService;

  let tenantAlpha: string;
  let tenantBeta: string;
  let campusAlpha: string;
  let authorAlpha: string;

  let userParent1: string;
  let userParent2: string;
  let userParentBeta: string;

  let student1: string;
  let student2: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_cmp_alpha_${timestamp}`;
    tenantBeta = `tenant_cmp_beta_${timestamp}`;
    campusAlpha = `campus_cmp_alpha_${timestamp}`;
    authorAlpha = `usr_author_alpha_${timestamp}`;

    userParent1 = `usr_par1_${timestamp}`;
    userParent2 = `usr_par2_${timestamp}`;
    userParentBeta = `usr_par_beta_${timestamp}`;

    student1 = `std_alpha1_${timestamp}`;
    student2 = `std_alpha2_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();

    audienceService = new AudienceService(prisma);
    templateService = new MessageTemplateService(prisma);
    policyService = new CommunicationPolicyService();
    walletService = new CommunicationWalletService(prisma);
    notificationsService = new NotificationsService(prisma);

    campaignService = new CampaignService(
      prisma,
      audienceService,
      templateService,
      policyService,
      walletService,
      notificationsService,
    );

    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha Grammar School', slug: `alpha-${timestamp}` },
            { id: tenantBeta, name: 'Beta High Academy', slug: `beta-${timestamp}` },
          ],
        });

        await prisma.campus.create({
          data: {
            id: campusAlpha,
            tenantId: tenantAlpha,
            name: 'Alpha Main Campus',
            code: 'CAMPUS-MAIN',
          },
        });

        await prisma.user.createMany({
          data: [
            {
              id: authorAlpha,
              tenantId: tenantAlpha,
              email: `admin@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Principal',
              lastName: 'Okafor',
            },
            {
              id: userParent1,
              tenantId: tenantAlpha,
              email: `parent1@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Adebayo',
              lastName: 'Johnson',
              phone: '+2348011111111',
            },
            {
              id: userParent2,
              tenantId: tenantAlpha,
              email: `parent2@alpha-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Chioma',
              lastName: 'Nwosu',
              phone: '+2348022222222',
            },
            {
              id: userParentBeta,
              tenantId: tenantBeta,
              email: `parent@beta-${timestamp}.com`,
              passwordHash: 'hash',
              firstName: 'Emeka',
              lastName: 'Kanu',
            },
          ],
        });

        await prisma.parent.createMany({
          data: [
            {
              id: `par_rec1_${timestamp}`,
              tenantId: tenantAlpha,
              userId: userParent1,
              firstName: 'Adebayo',
              lastName: 'Johnson',
              email: `parent1@alpha-${timestamp}.com`,
              phone: '+2348011111111',
            },
            {
              id: `par_rec2_${timestamp}`,
              tenantId: tenantAlpha,
              userId: userParent2,
              firstName: 'Chioma',
              lastName: 'Nwosu',
              phone: '+2348022222222',
            },
            {
              id: `par_beta_${timestamp}`,
              tenantId: tenantBeta,
              userId: userParentBeta,
              firstName: 'Emeka',
              lastName: 'Kanu',
              email: `parent@beta-${timestamp}.com`,
              phone: '+2348033333333',
            },
          ],
        });

        await prisma.student.createMany({
          data: [
            {
              id: student1,
              tenantId: tenantAlpha,
              campusId: campusAlpha,
              admissionNumber: `ADM-${timestamp}-01`,
              firstName: 'Femi',
              lastName: 'Johnson',
              gender: 'MALE',
            },
            {
              id: student2,
              tenantId: tenantAlpha,
              campusId: campusAlpha,
              admissionNumber: `ADM-${timestamp}-02`,
              firstName: 'Somto',
              lastName: 'Nwosu',
              gender: 'FEMALE',
            },
          ],
        });
      } catch (err: any) {
        console.warn(`Test DB setup error: ${err.message}`);
      }
    }
  });

  afterEach(async () => {
    if (prisma.isDbConnected) {
      try {
        await prisma.communicationRecipientLog.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.inAppInboxItem.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.communicationCampaign.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.communicationWalletTransaction.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.communicationWallet.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.parent.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.student.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.user.deleteMany({
          where: { tenantId: { in: [tenantAlpha, tenantBeta] } },
        });
        await prisma.campus.deleteMany({
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

  it('1. should create and dispatch an IN_APP broadcast, fanning out InAppInboxItems and logging recipient records', async () => {
    const campaign = await campaignService.createAndDispatchCampaign(tenantAlpha, authorAlpha, {
      title: 'PTA General Meeting',
      content: 'Important PTA meeting scheduled for this Saturday at 10 AM.',
      channels: [CampaignChannel.IN_APP],
      audience: { audienceType: AudienceType.ALL_PARENTS },
      priority: CampaignPriority.HIGH,
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.status).toBe(CampaignStatus.COMPLETED);
    expect(campaign.totalRecipients).toBe(2);
    expect(campaign.deliveredCount).toBe(2);
    expect(campaign.failedCount).toBe(0);
    expect(campaign.channelBreakdown[0].channel).toBe(CampaignChannel.IN_APP);
    expect(campaign.channelBreakdown[0].status).toBe('DELIVERED');

    // Verify InAppInboxItems were fanned out to recipient users
    const inbox1 = await notificationsService.listUserInbox(tenantAlpha, userParent1);
    expect(inbox1.items.length).toBeGreaterThanOrEqual(1);
    expect(inbox1.items[0].title).toBe('PTA General Meeting');
    expect(inbox1.items[0].message).toContain('Important PTA meeting');

    const inbox2 = await notificationsService.listUserInbox(tenantAlpha, userParent2);
    expect(inbox2.items.length).toBeGreaterThanOrEqual(1);

    // Verify recipient logs exist and are persisted
    const logs = await campaignService.getCampaignLogs(tenantAlpha, campaign.id);
    expect(logs.total).toBe(2);
    expect(logs.data.every((l) => l.status === 'DELIVERED')).toBe(true);
    expect(logs.data.every((l) => l.channel === CampaignChannel.IN_APP)).toBe(true);
  });

  it('2. should render templates with variables for individual recipients', async () => {
    // Top up wallet for SMS delivery
    await walletService.creditWallet(tenantAlpha, 500, 'PAY-REF-TMPL', 'Test credit for template');

    const template = await templateService.createTemplate(tenantAlpha, {
      name: 'Fee Due Alert',
      category: 'FEE_REMINDER' as any,
      channels: [CampaignChannel.SMS, CampaignChannel.IN_APP],
      subjectTemplate: 'School Notice for {{parentName}}',
      bodyTemplate: 'Dear {{parentName}}, please be notified that term fees are now due. Amount: ₦{{amount}}.',
      variables: ['parentName', 'amount'],
    });

    const campaign = await campaignService.createAndDispatchCampaign(tenantAlpha, authorAlpha, {
      title: 'Fee Reminder Notice',
      content: 'Fallback content',
      templateId: template.id,
      templateVariables: { amount: '75,000' },
      channels: [CampaignChannel.IN_APP, CampaignChannel.SMS],
      audience: { audienceType: AudienceType.ALL_PARENTS },
    });

    expect(campaign.status).toBe(CampaignStatus.COMPLETED);

    const logs = await campaignService.getCampaignLogs(tenantAlpha, campaign.id);
    expect(logs.total).toBe(4); // 2 parents x 2 channels = 4 recipient logs

    // Verify message personalization in logs
    const adebayoInApp = logs.data.find(
      (l) => l.recipientName?.includes('Adebayo') && l.channel === CampaignChannel.IN_APP,
    );
    expect(adebayoInApp?.messageContent).toContain('Dear Adebayo');
    expect(adebayoInApp?.messageContent).toContain('₦75,000');
  });

  it('3. should debit communication wallet for SMS/WhatsApp and mark as skipped if balance insufficient', async () => {
    // Tenant wallet has 0 balance initially
    const campaign = await campaignService.createAndDispatchCampaign(tenantAlpha, authorAlpha, {
      title: 'Emergency Storm Alert',
      content: 'School closes at 1 PM due to weather conditions.',
      channels: [CampaignChannel.SMS],
      audience: { audienceType: AudienceType.ALL_PARENTS },
    });

    // Should fail or skip SMS due to insufficient funds
    expect(campaign.status).toBe(CampaignStatus.FAILED);
    expect(campaign.channelBreakdown[0].status).toBe('SKIPPED_INSUFFICIENT_BALANCE');
    expect(campaign.deliveredCount).toBe(0);
    expect(campaign.failedCount).toBe(2);

    const logs = await campaignService.getCampaignLogs(tenantAlpha, campaign.id);
    expect(logs.data.every((l) => l.failureReason?.includes('Insufficient'))).toBe(true);

    // Now top up the wallet and dispatch again
    await walletService.creditWallet(tenantAlpha, 200, 'PAY-REF-TOPUP', 'Top up');

    const successfulCampaign = await campaignService.createAndDispatchCampaign(
      tenantAlpha,
      authorAlpha,
      {
        title: 'Emergency Storm Alert 2',
        content: 'School resumes normal schedule tomorrow.',
        channels: [CampaignChannel.SMS],
        audience: { audienceType: AudienceType.ALL_PARENTS },
      },
    );

    expect(successfulCampaign.status).toBe(CampaignStatus.COMPLETED);
    expect(successfulCampaign.deliveredCount).toBe(2);
    expect(successfulCampaign.totalCost).toBeGreaterThan(0);

    // Verify wallet balance decreased
    const wallet = await walletService.getOrCreateWallet(tenantAlpha);
    expect(wallet.balance).toBeLessThan(200);
  });

  it('4. should schedule a campaign for future delivery and allow cancellation', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // +24 hours

    const scheduled = await campaignService.createAndDispatchCampaign(tenantAlpha, authorAlpha, {
      title: 'Scheduled Science Fair Announcement',
      content: 'Reminder for tomorrow science fair.',
      channels: [CampaignChannel.IN_APP],
      audience: { audienceType: AudienceType.ALL_PARENTS },
      sendImmediately: false,
      scheduledFor: futureDate,
    });

    expect(scheduled.status).toBe(CampaignStatus.SCHEDULED);
    expect(scheduled.deliveredCount).toBe(0);

    // Verify cancellation
    const cancelled = await campaignService.cancelCampaign(tenantAlpha, scheduled.id);
    expect(cancelled.status).toBe('CANCELLED');

    const fetched = await campaignService.getCampaignById(tenantAlpha, scheduled.id);
    expect(fetched?.status).toBe('CANCELLED');
  });

  it('5. should enforce multi-tenant isolation across campaigns and logs', async () => {
    const campaignAlpha = await campaignService.createAndDispatchCampaign(tenantAlpha, authorAlpha, {
      title: 'Alpha Private Notice',
      content: 'Internal Alpha School Notice.',
      channels: [CampaignChannel.IN_APP],
      audience: { audienceType: AudienceType.ALL_PARENTS },
    });

    // Beta tenant lists campaigns
    const betaCampaigns = await campaignService.listCampaigns(tenantBeta);
    expect(betaCampaigns.some((c) => c.id === campaignAlpha.id)).toBe(false);

    // Beta tenant queries Alpha campaign ID
    const crossTenantGet = await campaignService.getCampaignById(tenantBeta, campaignAlpha.id);
    expect(crossTenantGet).toBeNull();

    // Beta tenant queries logs
    const crossLogs = await campaignService.getCampaignLogs(tenantBeta, campaignAlpha.id);
    expect(crossLogs.total).toBe(0);
    expect(crossLogs.data.length).toBe(0);
  });

  it('6. should support paginated log filtering by channel and status', async () => {
    const campaign = await campaignService.createAndDispatchCampaign(tenantAlpha, authorAlpha, {
      title: 'Multi Channel Test',
      content: 'Testing logs pagination and filtering.',
      channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL],
      audience: { audienceType: AudienceType.ALL_PARENTS },
    });

    // Filter logs for IN_APP channel only
    const inAppLogs = await campaignService.getCampaignLogs(tenantAlpha, campaign.id, {
      channel: 'IN_APP',
      limit: 10,
    });
    expect(inAppLogs.data.every((l) => l.channel === CampaignChannel.IN_APP)).toBe(true);

    // Filter logs for EMAIL channel only
    const emailLogs = await campaignService.getCampaignLogs(tenantAlpha, campaign.id, {
      channel: 'EMAIL',
      limit: 10,
    });
    expect(emailLogs.data.every((l) => l.channel === CampaignChannel.EMAIL)).toBe(true);
  });
});
