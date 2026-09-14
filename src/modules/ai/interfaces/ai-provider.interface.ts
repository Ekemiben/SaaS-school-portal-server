export interface AiCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tenantId?: string;
}

export interface AiCompletionResponse {
  content: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface IAiProvider {
  readonly providerName: string;
  isAvailable(): boolean;
  generateText(prompt: string, options?: AiCompletionOptions): Promise<AiCompletionResponse>;
  generateSummary(text: string, options?: AiCompletionOptions): Promise<string>;
}
