import { Module } from '@nestjs/common';
import { GeminiAiAdapter } from './adapters/gemini.adapter.js';
import { OpenAiAdapter } from './adapters/openai.adapter.js';
import { AiProviderFactory } from './services/ai-provider.factory.js';
import { AiService } from './services/ai.service.js';
import { AiController } from './controllers/ai.controller.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [AiController],
  providers: [
    GeminiAiAdapter,
    OpenAiAdapter,
    AiProviderFactory,
    AiService,
  ],
  exports: [AiService, AiProviderFactory],
})
export class AiModule {}
