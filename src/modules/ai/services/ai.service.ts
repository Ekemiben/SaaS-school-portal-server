import { Injectable, Logger } from '@nestjs/common';
import { AiProviderFactory } from './ai-provider.factory.js';
import { AuditService } from '../../audit/audit.service.js';
import { AiPromptDto, AiSummarizeDto } from '../dto/ai-request.dto.js';
import { AiCompletionResponse } from '../interfaces/ai-provider.interface.js';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly providerFactory: AiProviderFactory,
    private readonly auditService: AuditService,
  ) {}

  async generateCompletion(
    tenantId: string,
    userId: string,
    dto: AiPromptDto,
    providerPref?: string,
  ): Promise<AiCompletionResponse> {
    const provider = this.providerFactory.getProvider(providerPref);

    const systemPrompt =
      dto.systemPrompt ||
      'You are an AI teaching and school management assistant for a multi-tenant educational platform. Respond professionally and concisely.';

    const response = await provider.generateText(dto.prompt, {
      systemPrompt,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
      tenantId,
    });

    await this.auditService.log({
      tenantId,
      actorUserId: userId,
      action: 'AI_PROMPT_GENERATED',
      resourceType: 'AI_ASSISTANT',
      afterData: {
        provider: response.provider,
        model: response.model,
        tokensUsed: response.totalTokens,
      },
    });

    return response;
  }

  async summarizeReport(
    tenantId: string,
    userId: string,
    dto: AiSummarizeDto,
    providerPref?: string,
  ): Promise<{ summary: string; provider: string }> {
    const provider = this.providerFactory.getProvider(providerPref);
    const summary = await provider.generateSummary(dto.text, { tenantId });

    await this.auditService.log({
      tenantId,
      actorUserId: userId,
      action: 'AI_REPORT_SUMMARIZED',
      resourceType: 'AI_ASSISTANT',
      afterData: {
        provider: provider.providerName,
        textLength: dto.text.length,
      },
    });

    return { summary, provider: provider.providerName };
  }
}
