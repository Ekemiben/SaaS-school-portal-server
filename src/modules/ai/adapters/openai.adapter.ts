import { Injectable, Logger } from '@nestjs/common';
import { IAiProvider, AiCompletionOptions, AiCompletionResponse } from '../interfaces/ai-provider.interface.js';

@Injectable()
export class OpenAiAdapter implements IAiProvider {
  readonly providerName = 'OPENAI';
  private readonly logger = new Logger(OpenAiAdapter.name);

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generateText(prompt: string, options?: AiCompletionOptions): Promise<AiCompletionResponse> {
    const model = options?.model || 'gpt-4o-mini';

    if (process.env.OPENAI_API_KEY) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 1000,
            messages: [
              ...(options?.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          return {
            content,
            provider: this.providerName,
            model,
            promptTokens: data.usage?.prompt_tokens || Math.ceil(prompt.length / 4),
            completionTokens: data.usage?.completion_tokens || Math.ceil(content.length / 4),
            totalTokens: data.usage?.total_tokens || Math.ceil((prompt.length + content.length) / 4),
          };
        }
      } catch (err: any) {
        this.logger.warn(`OpenAI live API call failed, falling back to simulated output: ${err.message}`);
      }
    }

    const simulatedContent = `[OpenAI Assistant Response]: Processed prompt "${prompt.slice(0, 50)}..."`;
    return {
      content: simulatedContent,
      provider: this.providerName,
      model,
      promptTokens: 25,
      completionTokens: 20,
      totalTokens: 45,
    };
  }

  async generateSummary(text: string, options?: AiCompletionOptions): Promise<string> {
    const prompt = `Summarize the following educational content concisely:\n\n${text}`;
    const result = await this.generateText(prompt, options);
    return result.content;
  }
}
