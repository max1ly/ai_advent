import { streamText, createUIMessageStream } from 'ai';
import { deepseek } from '@/lib/deepseek';
import { openrouter } from '@/lib/openrouter';
import { MODELS, type ModelConfig } from '@/lib/models';

type Message = { role: 'user' | 'assistant'; content: string };

const DEFAULT_SYSTEM_PROMPT =
  'You must ALWAYS respond in English. Never use Chinese. If input is English, output must be English only.';

export class ChatAgent {
  private history: Message[] = [];
  private modelConfig: ModelConfig;
  private systemPrompt: string;
  private onMessagePersist?: (role: string, content: string) => void;

  constructor(opts?: {
    model?: string;
    systemPrompt?: string;
    history?: Message[];
    onMessagePersist?: (role: string, content: string) => void;
  }) {
    this.modelConfig =
      MODELS.find((m) => m.id === opts?.model) ?? MODELS[1];
    this.systemPrompt = opts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (opts?.history) {
      this.history = opts.history;
    }
    this.onMessagePersist = opts?.onMessagePersist;
  }

  chat(userMessage: string) {
    this.history.push({ role: 'user', content: userMessage });
    this.onMessagePersist?.('user', userMessage);

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
}
