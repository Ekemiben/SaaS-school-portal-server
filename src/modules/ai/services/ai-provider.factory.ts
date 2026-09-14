import { Injectable } from '@nestjs/common';
import { IAiProvider } from '../interfaces/ai-provider.interface.js';
import { GeminiAiAdapter } from '../adapters/gemini.adapter.js';
import { OpenAiAdapter } from '../adapters/openai.adapter.js';

@Injectable()
export class AiProviderFactory {
  constructor(
    private readonly geminiAdapter: GeminiAiAdapter,
    private readonly openaiAdapter: OpenAiAdapter,
  ) {}

  getProvider(preferred?: string): IAiProvider {
    const preference = (preferred || process.env.DEFAULT_AI_PROVIDER || 'GEMINI').toUpperCase();

    if (preference === 'OPENAI') {
      return this.openaiAdapter;
    }
    return this.geminiAdapter;
  }
}
