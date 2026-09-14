import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { GeminiAiAdapter } from '../src/modules/ai/adapters/gemini.adapter.js';
import { OpenAiAdapter } from '../src/modules/ai/adapters/openai.adapter.js';
import { AiProviderFactory } from '../src/modules/ai/services/ai-provider.factory.js';
import { AiService } from '../src/modules/ai/services/ai.service.js';

describe('AI Provider Abstraction & Governance (Section 87-89 ARCHITECTURE.md)', () => {
  let prisma: PrismaService;
  let auditService: AuditService;
  let geminiAdapter: GeminiAiAdapter;
  let openaiAdapter: OpenAiAdapter;
  let providerFactory: AiProviderFactory;
  let aiService: AiService;

  const tenantId = 'tenant_ai_school_100';
  const userId = 'usr_teacher_01';

  beforeEach(() => {
    prisma = new PrismaService();
    auditService = new AuditService(prisma);
    geminiAdapter = new GeminiAiAdapter();
    openaiAdapter = new OpenAiAdapter();
    providerFactory = new AiProviderFactory(geminiAdapter, openaiAdapter);
    aiService = new AiService(providerFactory, auditService);

    prisma.memoryStore.tenants.set(tenantId, {
      id: tenantId,
      name: 'Cambridge Science Academy',
      status: 'ACTIVE',
    });
  });

  it('should switch between Gemini and OpenAI providers seamlessly via factory', () => {
    const gemini = providerFactory.getProvider('GEMINI');
    expect(gemini.providerName).toBe('GEMINI');

    const openai = providerFactory.getProvider('OPENAI');
    expect(openai.providerName).toBe('OPENAI');

    const defaultProvider = providerFactory.getProvider();
    expect(defaultProvider).toBeDefined();
  });

  it('should generate completion and record tenant audit log', async () => {
    const result = await aiService.generateCompletion(
      tenantId,
      userId,
      {
        prompt: 'Generate a 3-question quiz for grade 9 algebra',
        temperature: 0.5,
      },
      'GEMINI',
    );

    expect(result.content).toBeDefined();
    expect(result.provider).toBe('GEMINI');
    expect(result.totalTokens).toBeGreaterThan(0);

    // Verify audit record
    const audits = Array.from(prisma.memoryStore.auditLogs.values()).filter(
      (a: any) => a.tenantId === tenantId,
    );
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe('AI_PROMPT_GENERATED');
    expect(audits[0].actorUserId).toBe(userId);
  });

  it('should generate educational text summary and record audit trail', async () => {
    const summaryRes = await aiService.summarizeReport(
      tenantId,
      userId,
      {
        text: 'The student demonstrated consistent improvement in science laboratory assessments, scoring 88% on organic chemistry.',
      },
      'OPENAI',
    );

    expect(summaryRes.summary).toBeDefined();
    expect(summaryRes.provider).toBe('OPENAI');

    const audits = Array.from(prisma.memoryStore.auditLogs.values()).filter(
      (a: any) => a.tenantId === tenantId,
    );
    expect(audits.some((a: any) => a.action === 'AI_REPORT_SUMMARIZED')).toBe(true);
  });
});
