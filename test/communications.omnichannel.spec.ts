import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { AudienceService } from '../src/modules/communications/services/audience.service.js';
import { MessageTemplateService } from '../src/modules/communications/services/message-template.service.js';
import { CommunicationPolicyService } from '../src/modules/communications/services/communication-policy.service.js';
import { CommunicationWalletService } from '../src/modules/communications/services/communication-wallet.service.js';
import { CommunicationPaystackService } from '../src/modules/communications/services/communication-paystack.service.js';
import { CampaignService } from '../src/modules/communications/services/campaign.service.js';
import { NotificationProcessor } from '../src/jobs/processors/notification.processor.js';
import { EmailAdapter } from '../src/modules/notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../src/modules/notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../src/modules/notifications/adapters/whatsapp.adapter.js';
import { PaystackPaymentAdapter } from '../src/modules/payments/adapters/paystack.adapter.js';
import {
  AudienceType,
} from '../src/modules/communications/dto/audience.dto.js';
import {
  CampaignChannel,
  CampaignPriority,
} from '../src/modules/communications/dto/campaign.dto.js';
import {
  TemplateCategory,
} from '../src/modules/communications/dto/template.dto.js';

describe('TASK 23 — Communication, Announcements & Omnichannel Messaging (Phase 10)', () => {
  let prisma: PrismaService;
  let audienceService: AudienceService;
  let templateService: MessageTemplateService;
  let policyService: CommunicationPolicyService;
  let walletService: CommunicationWalletService;
  let paystackService: CommunicationPaystackService;
  let campaignService: CampaignService;
  let paystackAdapter: PaystackPaymentAdapter;

  const tenantAlpha = 'tenant_comm_alpha';
  const tenantBeta = 'tenant_comm_beta';
  const campusA = 'campus_comm_a1';
  const student1 = 'std_comm_01';
  const student2 = 'std_comm_02';
  const parent1 = 'prt_comm_01';
  const parent2 = 'prt_comm_02';
  let fundedReference = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const configServiceMock: any = {
      get: vi.fn((key: string) => {
        if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mock_key';
        return 'mock-val';
      }),
    };

    const emailAdapter = new EmailAdapter();
    const smsAdapter = new SmsAdapter();
    const whatsAppAdapter = new WhatsAppAdapter();
    const notifProcessor = new NotificationProcessor(emailAdapter, smsAdapter, whatsAppAdapter);

    paystackAdapter = new PaystackPaymentAdapter(configServiceMock);
    vi.spyOn(paystackAdapter, 'initializePayment').mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.com/mock-comm-auth',
      accessCode: 'mock-comm-access',
      reference: 'COMM-FUND-123',
    });
    vi.spyOn(paystackAdapter, 'verifyPayment').mockImplementation(async (ref: string) => ({
      success: true,
      reference: ref,
      amount: 15000,
      status: 'successful',
      channel: 'card',
      paidAt: new Date(),
    } as any));
    vi.spyOn(paystackAdapter, 'verifyWebhookSignature').mockReturnValue(true);

    audienceService = new AudienceService(prisma);
    templateService = new MessageTemplateService();
    policyService = new CommunicationPolicyService(prisma);
    walletService = new CommunicationWalletService(prisma);
    paystackService = new CommunicationPaystackService(paystackAdapter, walletService);
    campaignService = new CampaignService(
      prisma,
      audienceService,
      templateService,
      policyService,
      walletService,
      notifProcessor,
    );

    // Setup Test Data
    prisma.memoryStore.tenants.set(tenantAlpha, { id: tenantAlpha, name: 'Grange School' });
    prisma.memoryStore.tenants.set(tenantBeta, { id: tenantBeta, name: 'Atlantic Hall' });
    prisma.memoryStore.campuses.set(campusA, { id: campusA, tenantId: tenantAlpha, name: 'Main Campus' });

    prisma.memoryStore.parents.set(parent1, {
      id: parent1,
      tenantId: tenantAlpha,
      firstName: 'Babajide',
      lastName: 'Sanwo',
      email: 'parent1@grange.edu.ng',
      phone: '+2348011223344',
    });

    prisma.memoryStore.parents.set(parent2, {
      id: parent2,
      tenantId: tenantAlpha,
      firstName: 'Ngozi',
      lastName: 'Okonjo',
      email: 'parent2@grange.edu.ng',
      phone: '+2348055667788',
    });

    prisma.memoryStore.students.set(student1, {
      id: student1,
      tenantId: tenantAlpha,
      campusId: campusA,
      currentClassId: 'cls_grade5',
      admissionNumber: 'GRG/2026/01',
      firstName: 'Damilola',
      lastName: 'Sanwo',
      status: 'ACTIVE',
    });

    prisma.memoryStore.students.set(student2, {
      id: student2,
      tenantId: tenantAlpha,
      campusId: campusA,
      currentClassId: 'cls_grade5',
      admissionNumber: 'GRG/2026/02',
      firstName: 'Chidi',
      lastName: 'Okonjo',
      status: 'ACTIVE',
    });

    // Invoice with outstanding balance
    prisma.memoryStore.invoices.set('inv_fee_01', {
      id: 'inv_fee_01',
      tenantId: tenantAlpha,
      studentId: student1,
      totalAmount: 150000,
      paidAmount: 50000,
      balanceAmount: 100000,
      status: 'PARTIALLY_PAID',
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('1. Smart audience resolution resolves static & dynamic school audiences', async () => {
    const allParents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.ALL_PARENTS,
    });
    expect(allParents.length).toBe(2);

    const feeDefaulterParents = await audienceService.resolveAudience(tenantAlpha, {
      audienceType: AudienceType.PARENTS_OUTSTANDING_FEES,
    });
    expect(feeDefaulterParents.length).toBe(1);
    expect(feeDefaulterParents[0].studentId).toBe(student1);
  });

  it('2. Message template interpolation renders custom variables safely', async () => {
    const tmpl = await templateService.createTemplate(tenantAlpha, {
      name: 'Custom Fee Alert',
      category: TemplateCategory.FEE_REMINDER,
      channels: [CampaignChannel.IN_APP, CampaignChannel.EMAIL],
      subjectTemplate: 'Payment Notice for {{studentName}}',
      bodyTemplate: 'Hello {{parentName}}, the outstanding fee of ₦{{amount}} is due on {{dueDate}}.',
    });

    const rendered = templateService.render(tmpl.bodyTemplate, {
      parentName: 'Mr. Sanwo',
      amount: '100,000',
      dueDate: '30th Sept',
    });

    expect(rendered).toBe('Hello Mr. Sanwo, the outstanding fee of ₦100,000 is due on 30th Sept.');
  });

  it('3. School communication policies are configurable per tenant', async () => {
    const updatedPolicy = await policyService.updateSettings(tenantAlpha, {
      whatsappEnabled: true,
      smsEnabled: true,
      monthlySpendingLimit: 75000,
    });

    expect(updatedPolicy.whatsappEnabled).toBe(true);
    expect(updatedPolicy.smsEnabled).toBe(true);
    expect(updatedPolicy.monthlySpendingLimit).toBe(75000);

    const channels = await policyService.resolveEffectiveChannels(
      tenantAlpha,
      undefined,
      'EMERGENCY',
    );
    expect(channels).toContain(CampaignChannel.IN_APP);
    expect(channels).toContain(CampaignChannel.PUSH);
    expect(channels).toContain(CampaignChannel.WHATSAPP);
  });

  it('4. Communication wallet funding via Paystack is completely separate from school fees', async () => {
    const init = await paystackService.initializeTopUp(tenantAlpha, {
      amount: 15000,
      customerEmail: 'admin@grange.sch.ng',
    });

    fundedReference = init.reference;
    expect(init.reference).toMatch(/^COMM-FUND-/);
    expect(init.authorizationUrl).toBeDefined();

    const verify = await paystackService.verifyTopUp(tenantAlpha, fundedReference);
    expect(verify.success).toBe(true);
    expect(verify.wallet.balance).toBe(15000);

    // Verify school fee invoice is completely untouched
    const feeInvoice = prisma.memoryStore.invoices.get('inv_fee_01');
    expect(feeInvoice.balanceAmount).toBe(100000);
  });

  it('5. Payment verification is idempotent and cannot double-credit wallet', async () => {
    const duplicateVerify = await paystackService.verifyTopUp(tenantAlpha, fundedReference);
    expect(duplicateVerify.wallet.balance).toBe(15000); // Idempotent: Does NOT double to 30000
  });

  it('6. Omnichannel campaign dispatches across all enabled channels and debits wallet for SMS/WhatsApp', async () => {
    const initialBalance = (await walletService.getOrCreateWallet(tenantAlpha)).balance;

    const campaign = await campaignService.createAndDispatchCampaign(tenantAlpha, 'admin_user', {
      title: 'School Resumption Protocol',
      content: 'Resumption is scheduled for 8:00 AM sharp.',
      channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.EMAIL, CampaignChannel.SMS],
      audience: { audienceType: AudienceType.ALL_PARENTS },
      priority: CampaignPriority.HIGH,
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.totalRecipients).toBe(2);
    expect(campaign.deliveredCount).toBeGreaterThanOrEqual(2);
    expect(campaign.totalCost).toBe(8.0); // 2 SMS * ₦4.00

    const updatedWallet = await walletService.getOrCreateWallet(tenantAlpha);
    expect(updatedWallet.balance).toBe(Number((initialBalance - 8.0).toFixed(2)));
  });

  it('7. When wallet balance is ₦0, In-App/Push still succeed without blocking school operations', async () => {
    // School Beta has zero balance and wallet disabled
    const campaign = await campaignService.createAndDispatchCampaign(tenantBeta, 'admin_beta', {
      title: 'General PTA Meeting',
      content: 'PTA meeting scheduled for Saturday.',
      channels: [CampaignChannel.IN_APP, CampaignChannel.PUSH, CampaignChannel.SMS],
      audience: { audienceType: AudienceType.CUSTOM_RECIPIENTS, customUserIds: ['user_cust_01'] },
    });

    expect(campaign.id).toBeDefined();
    const smsBreakdown = campaign.channelBreakdown.find((b) => b.channel === CampaignChannel.SMS);
    const inAppBreakdown = campaign.channelBreakdown.find((b) => b.channel === CampaignChannel.IN_APP);

    expect(smsBreakdown?.status).toBe('SKIPPED_INSUFFICIENT_BALANCE');
    expect(inAppBreakdown?.status).toBe('DELIVERED');
  });

  it('8. Multi-tenant isolation: Tenant B cannot access Tenant A wallet or transactions', async () => {
    const walletBeta = await walletService.getOrCreateWallet(tenantBeta);
    expect(walletBeta.balance).toBe(0);

    const txsAlpha = await walletService.listTransactions(tenantAlpha);
    const txsBeta = await walletService.listTransactions(tenantBeta);

    expect(txsAlpha.length).toBeGreaterThan(0);
    expect(txsBeta.length).toBe(0);
  });
});
