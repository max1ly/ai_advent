import { streamText, generateText, createUIMessageStream } from 'ai';
import { deepseek } from '@/lib/deepseek';
import { openrouter } from '@/lib/openrouter';
import { MODELS, type ModelConfig } from '@/lib/models';
import type { StrategySettings, StrategyType, SessionMetrics, LastRequestMetrics, Branch } from '@/lib/types';

type Message = { role: 'user' | 'assistant'; content: string };

export interface ChatFile {
  filename: string;
  mediaType: string;
  data: string; // base64
}

const DEFAULT_SYSTEM_PROMPT =
  'You must ALWAYS respond in English. Never use Chinese. If input is English, output must be English only.';

const FACTS_EXTRACTION_PROMPT =
  'You are a fact extractor. Given the current known facts and a new user message, update the facts. Return ONLY a valid JSON object where keys are short labels (goal, constraints, tech_stack, deadline, budget, etc.) and values are concise strings. Preserve existing facts unless contradicted. Add new facts from the user message. No markdown, no explanation — just the JSON object.';

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
  private strategy: StrategyType = 'sliding-window';
  private windowSize = 10;
  private facts: Record<string, string> = {};
  private branches: Branch[] = [];
  private activeBranchId: string | null = null;
  private checkpointHistory: Message[] | null = null;

  constructor(opts?: {
    model?: string;
    systemPrompt?: string;
    history?: Message[];
    onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
    strategy?: StrategySettings;
  }) {
    this.modelConfig = MODELS.find((m) => m.id === opts?.model) ?? MODELS[1];
    this.systemPrompt = opts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    if (opts?.history) {
      this.history = opts.history;
    }
    this.onMessagePersist = opts?.onMessagePersist;
    if (opts?.strategy) {
      this.strategy = opts.strategy.type;
      this.windowSize = opts.strategy.windowSize;
    }
    this.sessionMetrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalStrategyTokens: 0,
      exchanges: 0,
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

    this.getActiveHistory().push({ role: 'user', content: fullMessage });
    this.onMessagePersist?.('user', userMessage, files);

    const { modelConfig, systemPrompt } = this;
    const modelInstance =
      modelConfig.provider === 'openrouter'
        ? openrouter(modelConfig.id)
        : deepseek(modelConfig.id);

    const startTime = Date.now();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        let strategyTokens = 0;

        if (this.strategy === 'facts') {
          strategyTokens = await this.extractFacts(fullMessage);
        }

        const messages = this.buildMessages();

        console.log(`
\x1b[36m[Agent]\x1b[0m ─────────────────────────
  Model:          ${modelConfig.id} (${modelConfig.tier})
  Provider:       ${modelConfig.provider}
  History:        ${this.getActiveHistory().length} messages
  Strategy:       ${this.strategy} (window: ${this.windowSize})
  Facts:          ${Object.keys(this.facts).length} keys
  Branches:       ${this.branches.length}
────────────────────────────────────`);

        const result = streamText({
          model: modelInstance,
          system: systemPrompt,
          messages,
          onFinish: ({ text, usage }) => {
            this.getActiveHistory().push({ role: 'assistant', content: text });
            this.onMessagePersist?.('assistant', text);

            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;

            this.sessionMetrics.totalInputTokens += inputTokens;
            this.sessionMetrics.totalOutputTokens += outputTokens;
            this.sessionMetrics.totalTokens += inputTokens + outputTokens + strategyTokens;
            this.sessionMetrics.totalStrategyTokens += strategyTokens;
            this.sessionMetrics.exchanges += 1;

            const lastRequest: LastRequestMetrics = {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              strategyTokens,
            };

            console.log(`\x1b[32m[Agent]\x1b[0m Response complete:
  Time:     ${Date.now() - startTime}ms
  Tokens:   ${lastRequest.totalTokens} (${inputTokens} in + ${outputTokens} out)
  Strategy: ${strategyTokens} tokens overhead
  History:  ${this.getActiveHistory().length} messages`);

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
    return [...this.getActiveHistory()];
  }

  setModel(modelId: string): void {
    const config = MODELS.find((m) => m.id === modelId);
    if (config) {
      this.modelConfig = config;
    }
  }

  setStrategy(settings: StrategySettings): void {
    this.strategy = settings.type;
    this.windowSize = settings.windowSize;
  }

  clearHistory(): void {
    this.history = [];
    this.facts = {};
    this.branches = [];
    this.activeBranchId = null;
    this.checkpointHistory = null;
    this.sessionMetrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalStrategyTokens: 0,
      exchanges: 0,
    };
  }

  getFacts(): Record<string, string> {
    return { ...this.facts };
  }

  getBranches(): { id: string; name: string; messageCount: number }[] {
    return this.branches.map((b) => ({
      id: b.id,
      name: b.name,
      messageCount: b.messages.length,
    }));
  }

  createCheckpoint(): Branch[] {
    const currentHistory = this.getActiveHistory();

    this.checkpointHistory = currentHistory.map((m) => ({ ...m }));

    const branchA: Branch = {
      id: crypto.randomUUID(),
      name: 'Branch A',
      messages: currentHistory.map((m) => ({ ...m })),
    };

    const branchB: Branch = {
      id: crypto.randomUUID(),
      name: 'Branch B',
      messages: currentHistory.map((m) => ({ ...m })),
    };

    this.branches = [branchA, branchB];
    this.activeBranchId = branchA.id;

    console.log(`\x1b[33m[Agent]\x1b[0m Checkpoint created with ${currentHistory.length} messages, 2 branches`);

    return this.branches;
  }

  switchBranch(branchId: string): { messages: Message[]; activeBranchId: string } | null {
    const branch = this.branches.find((b) => b.id === branchId);
    if (!branch) return null;

    this.activeBranchId = branchId;

    console.log(`\x1b[33m[Agent]\x1b[0m Switched to ${branch.name} (${branch.messages.length} messages)`);

    return {
      messages: branch.messages,
      activeBranchId: branchId,
    };
  }

  private getActiveHistory(): Message[] {
    if (this.activeBranchId && this.branches.length > 0) {
      const branch = this.branches.find((b) => b.id === this.activeBranchId);
      if (branch) return branch.messages;
    }
    return this.history;
  }

  private buildMessages(): Message[] {
    const activeHistory = this.getActiveHistory();

    switch (this.strategy) {
      case 'sliding-window':
        return activeHistory.slice(-this.windowSize);

      case 'facts': {
        const factsJson = JSON.stringify(this.facts, null, 2);
        const factsMessage: Message = {
          role: 'user',
          content: `Known facts from our conversation:\n${factsJson}`,
        };
        const ack: Message = {
          role: 'assistant',
          content: 'I have the context from our conversation facts.',
        };
        return [factsMessage, ack, ...activeHistory.slice(-this.windowSize)];
      }

      case 'branching':
        return activeHistory;

      default:
        return activeHistory;
    }
  }

  private async extractFacts(userMessage: string): Promise<number> {
    const modelInstance = this.getModelInstance();

    const currentFacts = Object.keys(this.facts).length > 0
      ? `Current facts:\n${JSON.stringify(this.facts, null, 2)}`
      : 'No facts yet.';

    const result = await generateText({
      model: modelInstance,
      system: FACTS_EXTRACTION_PROMPT,
      prompt: `${currentFacts}\n\nNew user message: "${userMessage}"`,
    });

    try {
      const text = result.text.trim();
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const parsed = JSON.parse(jsonMatch[1]!.trim());
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        this.facts = parsed;
      }
    } catch {
      console.log('\x1b[33m[Agent]\x1b[0m Failed to parse facts JSON, keeping existing facts');
    }

    const tokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    console.log(`\x1b[33m[Agent]\x1b[0m Facts extracted: ${Object.keys(this.facts).length} keys (${tokens} tokens)`);

    return tokens;
  }

  private getModelInstance() {
    return this.modelConfig.provider === 'openrouter'
      ? openrouter(this.modelConfig.id)
      : deepseek(this.modelConfig.id);
  }
}
