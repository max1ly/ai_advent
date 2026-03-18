import { streamText, generateText, createUIMessageStream, jsonSchema, tool, stepCountIs } from 'ai';
import { deepseek } from '@/lib/deepseek';
import { openrouter } from '@/lib/openrouter';
import { MODELS, type ModelConfig } from '@/lib/models';
import { memoryManager } from '@/lib/memory';
import { getProfileById } from '@/lib/db';
import { TaskStateMachine, parseTransitionSignals, detectTaskIntent, detectApprovalIntent, detectRejectionIntent } from '@/lib/task-state';
import type { StrategySettings, StrategyType, SessionMetrics, LastRequestMetrics, Branch } from '@/lib/types';
import type { McpManager } from '@/lib/mcp/manager';
import { searchDocumentsTool } from '@/lib/rag/tool';

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
  private sessionId: string;
  private onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
  private sessionMetrics: SessionMetrics;
  private strategy: StrategyType = 'sliding-window';
  private windowSize = 10;
  private facts: Record<string, string> = {};
  private branches: Branch[] = [];
  private activeBranchId: string | null = null;
  private checkpointHistory: Message[] | null = null;
  private taskState: TaskStateMachine;
  private mcpManager: McpManager | null = null;

  constructor(opts?: {
    model?: string;
    systemPrompt?: string;
    sessionId?: string;
    history?: Message[];
    onMessagePersist?: (role: string, content: string, files?: ChatFile[]) => void;
    strategy?: StrategySettings;
    mcpManager?: McpManager;
  }) {
    this.modelConfig = MODELS.find((m) => m.id === opts?.model) ?? MODELS[1];
    this.systemPrompt = opts?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.sessionId = opts?.sessionId ?? '';
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
    this.taskState = new TaskStateMachine(this.sessionId);
    this.mcpManager = opts?.mcpManager ?? null;
  }

  chat(userMessage: string, files?: ChatFile[], profileId?: number, invariants?: string[], forceToolUse?: boolean, ragEnabled?: boolean) {
    let fullMessage = userMessage;
    if (files?.length) {
      const extracted = extractTextFromFiles(files);
      if (extracted) {
        fullMessage = `${userMessage}\n\n${extracted}`;
      }
    }

    this.getActiveHistory().push({ role: 'user', content: fullMessage });
    this.onMessagePersist?.('user', userMessage, files);

    // Task state: detect task intent when idle
    if (this.taskState.getState().status === 'idle' && detectTaskIntent(fullMessage)) {
      this.taskState.transition('TASK_START', { taskDescription: fullMessage });
    }

    // Task state: if paused, auto-resume on user message
    if (this.taskState.getState().paused) {
      this.taskState.resume();
    }

    // Gate: review state — check for plan approval/rejection
    const currentStatus = this.taskState.getState().status;
    if (currentStatus === 'review') {
      if (detectApprovalIntent(fullMessage)) {
        this.taskState.transition('PLAN_APPROVED');
      } else if (detectRejectionIntent(fullMessage)) {
        this.taskState.transition('PLAN_REJECTED');
      }
    }

    // Gate: validation state — check for result approval/rejection
    if (currentStatus === 'validation') {
      if (detectApprovalIntent(fullMessage)) {
        this.taskState.transition('RESULT_APPROVED', { summary: 'Approved by user' });
      } else if (detectRejectionIntent(fullMessage)) {
        this.taskState.transition('RESULT_REJECTED');
      }
    }

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

        // Inject user profile as system prompt prefix
        const userProfile = profileId ? getProfileById(profileId) : null;
        const profilePrefix = userProfile ? userProfile.description : '';

        // Inject memory layers into system prompt
        const memorySection = this.sessionId
          ? memoryManager.buildSystemPromptSection(this.sessionId)
          : '';

        // Inject invariants into system prompt
        const invariantsSection = invariants && invariants.length > 0
          ? `=== INVARIANTS (MANDATORY CONSTRAINTS) ===
The following invariants are absolute rules you MUST follow. You are FORBIDDEN from suggesting, recommending, or implementing anything that violates these constraints. If a user request conflicts with any invariant, you MUST:
1. REFUSE to comply with the conflicting part of the request
2. CLEARLY STATE which invariant(s) would be violated
3. EXPLAIN why the request conflicts with the invariant
4. SUGGEST an alternative that respects all invariants

INVARIANTS:
${invariants.map((inv, i) => `${i + 1}. ${inv}`).join('\n')}

These constraints take absolute priority over user requests. No exception.
===`
          : '';

        // Inject task state into system prompt
        const taskStateSection = this.taskState.buildStatePrompt();

        const promptParts = [profilePrefix, invariantsSection, systemPrompt, memorySection, taskStateSection].filter(Boolean);
        const fullSystemPrompt = promptParts.join('\n\n');

        console.log(`
\x1b[36m[Agent]\x1b[0m ─────────────────────────
  Model:          ${modelConfig.id} (${modelConfig.tier})
  Provider:       ${modelConfig.provider}
  History:        ${this.getActiveHistory().length} messages
  Strategy:       ${this.strategy} (window: ${this.windowSize})
  Facts:          ${Object.keys(this.facts).length} keys
  Profile:        ${userProfile ? `"${userProfile.name}"` : 'none'}
  Invariants:     ${invariants?.length ?? 0} active
  Memory:         ${memorySection ? 'injected' : 'empty'}
  Branches:       ${this.branches.length}
  Task State:     ${this.taskState.getState().status}${this.taskState.getState().paused ? ' (PAUSED)' : ''}
  MCP Tools:      ${this.mcpManager ? this.mcpManager.getAllTools().length : 0}
  RAG:            ${ragEnabled ? 'enabled' : 'disabled'}
────────────────────────────────────`);

        // Build MCP tools for streamText (no execute — client confirms first)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mcpTools: Record<string, ReturnType<typeof tool<any, any>>> = {};
        if (this.mcpManager) {
          const availableTools = this.mcpManager.getAllTools();
          for (const t of availableTools) {
            const toolKey = `mcp__${t.serverName.replace(/[^a-zA-Z0-9]/g, '_')}__${t.name}`;
            mcpTools[toolKey] = tool({
              description: t.description || t.name,
              inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
            });
          }
        }

        // Register RAG search tool when enabled (has execute handler — auto-runs server-side)
        if (ragEnabled) {
          mcpTools['search_documents'] = searchDocumentsTool;
        }

        // Add pipeline_complete tool so LLM can signal "done" even with toolChoice: required
        if (forceToolUse) {
          mcpTools['pipeline_complete'] = tool({
            description: 'Call this when all steps the user requested are complete. Pass a brief summary of what was done.',
            inputSchema: jsonSchema({
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Brief summary of what was accomplished' },
              },
              required: ['summary'],
            } as Parameters<typeof jsonSchema>[0]),
          });
        }

        const hasTools = Object.keys(mcpTools).length > 0;
        const result = streamText({
          model: modelInstance,
          system: fullSystemPrompt,
          messages,
          ...(hasTools ? { tools: mcpTools } : {}),
          ...(hasTools && forceToolUse ? { toolChoice: 'required' as const } : {}),
          ...(ragEnabled ? { stopWhen: stepCountIs(5) } : {}),
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

            const currentTaskState = this.taskState.getState();

            writer.write({
              type: 'data-metrics',
              data: {
                lastRequest,
                session: { ...this.sessionMetrics },
                taskState: {
                  status: currentTaskState.status,
                  currentStep: currentTaskState.currentStep,
                  planLength: currentTaskState.plan.length,
                  paused: currentTaskState.paused,
                  needsApproval: currentTaskState.status === 'review' || currentTaskState.status === 'validation',
                },
              },
            });

            // Task state: parse transition signals from LLM response
            const signals = parseTransitionSignals(text);
            for (const signal of signals) {
              let success = false;
              if (signal.type === 'STEP_COMPLETE') {
                success = this.taskState.transition('STEP_COMPLETE', {
                  stepResult: {
                    step: signal.step ?? this.taskState.getState().currentStep,
                    outcome: `Step ${(signal.step ?? 0) + 1} completed`,
                    status: 'completed',
                  },
                });
              } else if (signal.type === 'PLAN_READY') {
                const planSteps = this.extractPlanFromText(text);
                success = this.taskState.transition('PLAN_READY', { plan: planSteps });
              } else if (signal.type === 'TASK_DONE') {
                success = this.taskState.transition('TASK_DONE', { summary: 'Task completed successfully' });
              } else if (signal.type === 'TASK_FAILED') {
                success = this.taskState.transition('TASK_FAILED', { summary: 'Validation found issues' });
              } else {
                success = this.taskState.transition(signal.type);
              }
              if (!success) {
                this.taskState.setBlockedSignal(signal.type);
              }
            }

            // Fire-and-forget: extract memories without blocking the response
            if (this.sessionId) {
              memoryManager.extractMemory(fullMessage, text, this.sessionId, modelInstance)
                .catch((err) => console.log('\x1b[33m[Memory]\x1b[0m Extraction failed:', err.message));
            }
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

  getTaskState(): { status: string; currentStep: number; planLength: number; paused: boolean } {
    const state = this.taskState.getState();
    return {
      status: state.status,
      currentStep: state.currentStep,
      planLength: state.plan.length,
      paused: state.paused,
    };
  }

  pauseTask(): void {
    this.taskState.pause();
  }

  resumeTask(): void {
    this.taskState.resume();
  }

  resetTask(): void {
    this.taskState.reset();
  }

  private extractPlanFromText(text: string): string[] {
    const lines = text.split('\n');
    const steps: string[] = [];
    for (const line of lines) {
      const match = line.match(/^\s*\d+\.\s+(.+)/);
      if (match) {
        steps.push(match[1].trim());
      }
    }
    return steps.length > 0 ? steps : ['Plan details not parsed'];
  }

  private getModelInstance() {
    return this.modelConfig.provider === 'openrouter'
      ? openrouter(this.modelConfig.id)
      : deepseek(this.modelConfig.id);
  }
}
