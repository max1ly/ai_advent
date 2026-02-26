import { streamText, createUIMessageStream } from 'ai';
import { deepseek } from '@/lib/deepseek';
import { openrouter } from '@/lib/openrouter';
import { MODELS, type ModelConfig } from '@/lib/models';

type Message = { role: 'user' | 'assistant'; content: string };

export interface ChatFile {
  filename: string;
  mediaType: string;
  data: string; // base64
}

export interface SessionMetrics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  exchanges: number;
  contextWindow: number;
}

const DEFAULT_SYSTEM_PROMPT =
  'You must ALWAYS respond in English. Never use Chinese. If input is English, output must be English only.';

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
  private modelConfig: ModelConfig;
  private systemPrompt: string;
  private onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
  private sessionMetrics: SessionMetrics;

  constructor(opts?: {
    model?: string;
    systemPrompt?: string;
    history?: Message[];
    onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
  }) {
    this.modelConfig =
      MODELS.find((m) => m.id === opts?.model) ?? MODELS[1];
    this.systemPrompt = opts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (opts?.history) {
      this.history = opts.history;
    }
    this.onMessagePersist = opts?.onMessagePersist;
    this.sessionMetrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      exchanges: 0,
      contextWindow: this.modelConfig.contextWindow,
    };
  }

  chat(userMessage: string, files?: ChatFile[]) {
    // Build the full message with extracted file text
    let fullMessage = userMessage;
    if (files?.length) {
      const extracted = extractTextFromFiles(files);
      if (extracted) {
        fullMessage = `${userMessage}\n\n${extracted}`;
      }
    }

    this.history.push({ role: 'user', content: fullMessage });
    this.onMessagePersist?.('user', userMessage, files);

    const { modelConfig, systemPrompt, history } = this;
    const modelInstance =
      modelConfig.provider === 'openrouter'
        ? openrouter(modelConfig.id)
        : deepseek(modelConfig.id);

    console.log(`
\x1b[36m[Agent]\x1b[0m ─────────────────────────
  Model:          ${modelConfig.id} (${modelConfig.tier})
  Provider:       ${modelConfig.provider}
  History:        ${history.length} messages
────────────────────────────────────`);

    const startTime = Date.now();

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const result = streamText({
          model: modelInstance,
          system: systemPrompt,
          messages: history,
          onFinish: ({ text, usage }) => {
            // Append assistant response to history
            this.history.push({ role: 'assistant', content: text });
            this.onMessagePersist?.('assistant', text);

            const elapsed = Date.now() - startTime;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;
            const totalTokens = inputTokens + outputTokens;
            const cost =
              (inputTokens / 1_000_000) * modelConfig.pricing.input +
              (outputTokens / 1_000_000) * modelConfig.pricing.output;

            this.sessionMetrics.totalInputTokens += inputTokens;
            this.sessionMetrics.totalOutputTokens += outputTokens;
            this.sessionMetrics.totalTokens += inputTokens + outputTokens;
            this.sessionMetrics.totalCost += cost;
            this.sessionMetrics.exchanges += 1;
            this.sessionMetrics.contextWindow = modelConfig.contextWindow;

            console.log(`\x1b[32m[Agent]\x1b[0m Response complete:
  Time:     ${elapsed}ms
  Tokens:   ${totalTokens} (${inputTokens} in + ${outputTokens} out)
  Cost:     $${cost.toFixed(6)}
  History:  ${this.history.length} messages`);

            writer.write({
              type: 'data-metrics',
              data: {
                responseTime: elapsed,
                inputTokens,
                outputTokens,
                totalTokens,
                cost,
                model: modelConfig.id,
                tier: modelConfig.tier,
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
      this.sessionMetrics.contextWindow = config.contextWindow;
    }
  }
}
