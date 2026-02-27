import { streamText, generateText, createUIMessageStream } from 'ai';
import { deepseek } from '@/lib/deepseek';
import { openrouter } from '@/lib/openrouter';
import { MODELS, type ModelConfig } from '@/lib/models';
import type { CompressionSettings, SessionMetrics, LastRequestMetrics } from '@/lib/types';

type Message = { role: 'user' | 'assistant'; content: string };

export interface ChatFile {
  filename: string;
  mediaType: string;
  data: string; // base64
}

const DEFAULT_SYSTEM_PROMPT =
  'You must ALWAYS respond in English. Never use Chinese. If input is English, output must be English only.';

const SUMMARIZATION_PROMPT =
  'Summarize this conversation concisely. Preserve key facts, decisions, user preferences, and any code or technical details discussed. Keep it under 200 words.';

const TEXT_TYPES = new Set([
  'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
  'application/json', 'application/xml', 'text/xml', 'text/markdown',
]);

function isTextFile(mediaType: string): boolean {
  return TEXT_TYPES.has(mediaType) || mediaType.startsWith('text/');
}

function extractTextFromFiles(files: ChatFile[]): string {
  const parts: string[] = [];
  for (const file of files) {
    if (isTextFile(file.mediaType)) {
      const text = Buffer.from(file.data, 'base64').toString('utf-8');
      parts.push(`[File: ${file.filename}]\n${text}`);
    }
  }
  return parts.join('\n\n');
}

export class ChatAgent {
  private history: Message[] = [];
  private summaries: string[] = [];
  private modelConfig: ModelConfig;
  private systemPrompt: string;
  private onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
  private sessionMetrics: SessionMetrics;
  private compressionEnabled = false;
  private recentWindowSize = 6;
  private summaryBatchSize = 10;

  constructor(opts?: {
    model?: string;
    systemPrompt?: string;
    history?: Message[];
    onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
    compression?: CompressionSettings;
  }) {
    this.modelConfig = MODELS.find((m) => m.id === opts?.model) ?? MODELS[1];
    this.systemPrompt = opts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (opts?.history) {
      this.history = opts.history;
    }
    this.onMessagePersist = opts?.onMessagePersist;
    if (opts?.compression) {
      this.compressionEnabled = opts.compression.enabled;
      this.recentWindowSize = opts.compression.recentWindowSize;
      this.summaryBatchSize = opts.compression.summaryBatchSize;
    }
    this.sessionMetrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalSummarizationTokens: 0,
      exchanges: 0,
      summariesGenerated: 0,
    };
  }

  chat(userMessage: string, files?: ChatFile[]) {
    let fullMessage = userMessage;
    if (files?.length) {
      const extracted = extractTextFromFiles(files);
      if (extracted) {
        fullMessage = `${userMessage}\n\n${extracted}`;
      }
    }

    this.history.push({ role: 'user', content: fullMessage });
    this.onMessagePersist?.('user', userMessage, files);

    const { modelConfig, systemPrompt } = this;
    const modelInstance =
      modelConfig.provider === 'openrouter'
        ? openrouter(modelConfig.id)
        : deepseek(modelConfig.id);

    const startTime = Date.now();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const summarizationTokens = await this.compressIfNeeded();
        const messages = this.buildMessages();

        console.log(`
\x1b[36m[Agent]\x1b[0m ─────────────────────────
  Model:          ${modelConfig.id} (${modelConfig.tier})
  Provider:       ${modelConfig.provider}
  History:        ${this.history.length} messages
  Summaries:      ${this.summaries.length}
  Compression:    ${this.compressionEnabled ? 'ON' : 'OFF'}
────────────────────────────────────`);

        const result = streamText({
          model: modelInstance,
          system: systemPrompt,
          messages,
          onFinish: ({ text, usage }) => {
            this.history.push({ role: 'assistant', content: text });
            this.onMessagePersist?.('assistant', text);

            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;

            this.sessionMetrics.totalInputTokens += inputTokens;
            this.sessionMetrics.totalOutputTokens += outputTokens;
            this.sessionMetrics.totalTokens += inputTokens + outputTokens + summarizationTokens;
            this.sessionMetrics.exchanges += 1;

            const lastRequest: LastRequestMetrics = {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              summarizationTokens,
            };

            console.log(`\x1b[32m[Agent]\x1b[0m Response complete:
  Time:     ${Date.now() - startTime}ms
  Tokens:   ${lastRequest.totalTokens} (${inputTokens} in + ${outputTokens} out)
  Summary:  ${summarizationTokens} tokens overhead
  History:  ${this.history.length} messages`);

            writer.write({
              type: 'data-metrics',
              data: {
                lastRequest,
                session: { ...this.sessionMetrics },
              },
            });
          },
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return stream;
  }

  getHistory(): Message[] {
    return [...this.history];
  }

  setModel(modelId: string): void {
    const config = MODELS.find((m) => m.id === modelId);
    if (config) {
      this.modelConfig = config;
    }
  }

  setCompression(settings: CompressionSettings): void {
    this.compressionEnabled = settings.enabled;
    this.recentWindowSize = settings.recentWindowSize;
    this.summaryBatchSize = settings.summaryBatchSize;
  }

  private async compressIfNeeded(): Promise<number> {
    if (!this.compressionEnabled) return 0;

    const overflow = this.history.length - this.recentWindowSize;
    if (overflow < this.summaryBatchSize) return 0;

    const batch = this.history.slice(0, this.summaryBatchSize);
    const conversationText = batch
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const modelInstance =
      this.modelConfig.provider === 'openrouter'
        ? openrouter(this.modelConfig.id)
        : deepseek(this.modelConfig.id);

    const result = await generateText({
      model: modelInstance,
      system: SUMMARIZATION_PROMPT,
      prompt: conversationText,
    });

    this.summaries.push(result.text);
    this.history = this.history.slice(this.summaryBatchSize);

    const summarizationTokens =
      (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

    this.sessionMetrics.totalSummarizationTokens += summarizationTokens;
    this.sessionMetrics.summariesGenerated += 1;

    console.log(`\x1b[33m[Agent]\x1b[0m Compressed ${this.summaryBatchSize} messages into summary #${this.summaries.length} (${summarizationTokens} tokens)`);

    return summarizationTokens;
  }

  private buildMessages(): Message[] {
    if (!this.compressionEnabled || this.summaries.length === 0) {
      return this.history;
    }

    const summaryText = this.summaries
      .map((s, i) => `[Summary ${i + 1}]: ${s}`)
      .join('\n\n');

    const summaryMessage: Message = {
      role: 'user',
      content: `Previous conversation summary:\n\n${summaryText}`,
    };

    return [
      summaryMessage,
      { role: 'assistant', content: 'Understood, I have the context from our previous conversation.' },
      ...this.history,
    ];
  }
}
