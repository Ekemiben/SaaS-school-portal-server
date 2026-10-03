import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommunicationPolicyService } from '../src/modules/communications/services/communication-policy.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CampaignChannel } from '../src/modules/communications/dto/campaign.dto.js';

describe('Phase 8 — Communication Policy & Settings Architecture', () => {
  let prisma: PrismaService;
  let policyService: CommunicationPolicyService;

  let tenantAlpha: string;
  let tenantBeta: string;

  beforeEach(async () => {
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tenantAlpha = `tenant_set_alpha_${timestamp}`;
    tenantBeta = `tenant_set_beta_${timestamp}`;

    prisma = new PrismaService();
    await prisma.onModuleInit();

    policyService = new CommunicationPolicyService(prisma);

    if (prisma.isDbConnected) {
      try {
        await prisma.tenant.createMany({
          data: [
            { id: tenantAlpha, name: 'Alpha Grammar', slug: `alpha-${timestamp}` },
            { id: tenantBeta, name: 'Beta Comprehensive', slug: `beta-${timestamp}` },
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
        await prisma.communicationSettings.deleteMany({
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

  it('1. should auto-initialize standard communication settings on first access', async () => {
    const settings = await policyService.getSettings(tenantAlpha);

    expect(settings.tenantId).toBe(tenantAlpha);
    expect(settings.inAppEnabled).toBe(true);
    expect(settings.emailEnabled).toBe(true);
    expect(settings.pushEnabled).toBe(true);
    expect(settings.smsEnabled).toBe(false); // default off until enabled
    expect(settings.whatsappEnabled).toBe(false);
    expect(settings.smsUnitCost).toBe(4.0);
    expect(settings.whatsappUnitCost).toBe(8.5);
    expect(settings.monthlySpendingLimit).toBe(50000);
  });

  it('2. should update communication settings, channel switches, and spending limits', async () => {
    const updated = await policyService.updateSettings(tenantAlpha, {
      smsEnabled: true,
      whatsappEnabled: true,
      smsUnitCost: 5.5,
      whatsappUnitCost: 10.0,
      monthlySpendingLimit: 100000,
      feeReminderChannels: [CampaignChannel.IN_APP, CampaignChannel.SMS, CampaignChannel.WHATSAPP],
    });

    expect(updated.smsEnabled).toBe(true);
    expect(updated.whatsappEnabled).toBe(true);
    expect(updated.smsUnitCost).toBe(5.5);
    expect(updated.whatsappUnitCost).toBe(10.0);
    expect(updated.monthlySpendingLimit).toBe(100000);
    expect(updated.feeReminderChannels).toContain(CampaignChannel.WHATSAPP);

    // Verify persistence across reload
    const reloaded = await policyService.getSettings(tenantAlpha);
    expect(reloaded.smsEnabled).toBe(true);
    expect(reloaded.whatsappUnitCost).toBe(10.0);
  });

  it('3. should resolve effective channels applying enabled channel master switches', async () => {
    // Initial state: SMS and WhatsApp are disabled
    const channelsInitial = await policyService.resolveEffectiveChannels(
      tenantAlpha,
      [CampaignChannel.IN_APP, CampaignChannel.SMS, CampaignChannel.EMAIL],
    );

    // SMS is filtered out because smsEnabled is false
    expect(channelsInitial).toContain(CampaignChannel.IN_APP);
    expect(channelsInitial).toContain(CampaignChannel.EMAIL);
    expect(channelsInitial).not.toContain(CampaignChannel.SMS);

    // Now enable SMS
    await policyService.updateSettings(tenantAlpha, { smsEnabled: true });

    const channelsAfterEnable = await policyService.resolveEffectiveChannels(
      tenantAlpha,
      [CampaignChannel.IN_APP, CampaignChannel.SMS, CampaignChannel.EMAIL],
    );

    expect(channelsAfterEnable).toContain(CampaignChannel.SMS);
  });

  it('4. should resolve event-specific channels dynamically for emergency and fee reminders', async () => {
    await policyService.updateSettings(tenantAlpha, {
      smsEnabled: true,
      whatsappEnabled: true,
      emergencyChannels: [CampaignChannel.IN_APP, CampaignChannel.SMS, CampaignChannel.WHATSAPP],
      feeReminderChannels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL],
    });

    const emergency = await policyService.resolveEffectiveChannels(
      tenantAlpha,
      undefined,
      'EMERGENCY',
    );
    expect(emergency).toContain(CampaignChannel.IN_APP);
    expect(emergency).toContain(CampaignChannel.SMS);
    expect(emergency).toContain(CampaignChannel.WHATSAPP);

    const feeReminder = await policyService.resolveEffectiveChannels(
      tenantAlpha,
      undefined,
      'FEE_REMINDER',
    );
    expect(feeReminder).toContain(CampaignChannel.IN_APP);
    expect(feeReminder).toContain(CampaignChannel.EMAIL);
    expect(feeReminder).not.toContain(CampaignChannel.SMS);
  });

  it('5. should reset settings back to initial system defaults', async () => {
    // Modify settings
    await policyService.updateSettings(tenantAlpha, {
      smsEnabled: true,
      smsUnitCost: 20.0,
      monthlySpendingLimit: 5000,
    });

    // Reset settings
    const reset = await policyService.resetDefaultSettings(tenantAlpha);

    expect(reset.smsEnabled).toBe(false);
    expect(reset.smsUnitCost).toBe(4.0);
    expect(reset.monthlySpendingLimit).toBe(50000);
  });

  it('6. should enforce strict multi-tenant isolation across settings', async () => {
    // Update Alpha settings
    await policyService.updateSettings(tenantAlpha, {
      smsEnabled: true,
      smsUnitCost: 7.5,
    });

    // Query Beta settings -> Default unmodified state
    const betaSettings = await policyService.getSettings(tenantBeta);
    expect(betaSettings.smsEnabled).toBe(false);
    expect(betaSettings.smsUnitCost).toBe(4.0);
  });
});
