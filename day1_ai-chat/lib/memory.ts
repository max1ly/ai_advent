import { generateText } from 'ai';
import {
  getWorkingMemory,
  saveWorkingMemory,
  getProfile,
  saveProfileEntry,
  getSolutions,
  saveSolution,
  getKnowledge,
  saveKnowledge,
} from '@/lib/db';
import type { MemoryState, MemoryExtractionResult } from '@/lib/types';

const MEMORY_EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the user's message and decide what to store.

Given the EXISTING MEMORY state and a NEW USER MESSAGE, output a JSON object with memory updates.

Categories:

WORKING_MEMORY: Current task the user is working on.
- task_description: What is the user working on? (empty string if no task)
- progress: What progress on this task? (empty string if none)
- hypotheses: Open questions or approaches? (empty string if none)
- is_new_task: true if this is a DIFFERENT task than existing working memory

PROFILE: Stable facts about the user. ONLY from explicit user statements.
- Extract: name, role, expertise, preferences, tools, language
- operation: ADD (new), UPDATE (changed), NOOP (already known)

SOLUTIONS: Completed task procedures. ONLY when a task was completed successfully.
- task: what was accomplished
- steps: array of ordered steps taken
- outcome: "success"
- Set to null if no task was completed this turn

KNOWLEDGE: General facts or domain knowledge.
- fact: a verifiable statement
- source: "conversation"
- operation: ADD (new), NOOP (already known)

Return ONLY valid JSON. No markdown, no explanation. Empty arrays for categories with no updates.
Example output:
{
  "working_memory": { "task_description": "implement auth", "progress": "chose JWT", "hypotheses": "considering session vs token", "is_new_task": true },
  "profile": [{ "key": "name", "value": "Max", "operation": "ADD" }],
  "solutions": null,
  "knowledge": [{ "fact": "Project uses Next.js 15", "source": "conversation", "operation": "ADD" }]
}`;

export class MemoryManager {
  getMemoryState(sessionId: string): MemoryState {
    const wm = getWorkingMemory(sessionId);
    return {
      workingMemory: wm
        ? {
            id: wm.id,
            session_id: wm.session_id,
            task_description: wm.task_description,
            progress: wm.progress,
            hypotheses: wm.hypotheses,
            updated_at: wm.updated_at,
          }
        : null,
      profile: getProfile(),
      solutions: getSolutions(),
      knowledge: getKnowledge(),
    };
  }

  buildSystemPromptSection(sessionId: string): string {
    const state = this.getMemoryState(sessionId);
    const sections: string[] = [];

    // LTM first (stable context)
    const ltmParts: string[] = [];

    if (state.profile.length > 0) {
      const profileLines = state.profile.map((p) => `- ${p.key}: ${p.value}`).join('\n');
      ltmParts.push(`Profile:\n${profileLines}`);
    }

    if (state.solutions.length > 0) {
      const solutionLines = state.solutions
        .map((s, i) => {
          let steps: string[];
          try {
            steps = JSON.parse(s.steps);
          } catch {
            steps = [s.steps];
          }
          return `${i + 1}. "${s.task}" → [${steps.join(', ')}]`;
        })
        .join('\n');
      ltmParts.push(`Solutions (${state.solutions.length} learned procedure${state.solutions.length > 1 ? 's' : ''}):\n${solutionLines}`);
    }

    if (state.knowledge.length > 0) {
      const knowledgeLines = state.knowledge.map((k) => `- ${k.fact}`).join('\n');
      ltmParts.push(`Knowledge (${state.knowledge.length} fact${state.knowledge.length > 1 ? 's' : ''}):\n${knowledgeLines}`);
    }

    if (ltmParts.length > 0) {
      sections.push(`=== LONG-TERM MEMORY ===\n\n${ltmParts.join('\n\n')}`);
    }

    // Working Memory
    if (state.workingMemory) {
      const wm = state.workingMemory;
      const wmParts: string[] = [];
      if (wm.task_description) wmParts.push(`Task: ${wm.task_description}`);
      if (wm.progress) wmParts.push(`Progress: ${wm.progress}`);
      if (wm.hypotheses) wmParts.push(`Hypotheses: ${wm.hypotheses}`);

      if (wmParts.length > 0) {
        sections.push(`=== WORKING MEMORY ===\n\n${wmParts.join('\n')}`);
      }
    }

    return sections.length > 0 ? sections.join('\n\n') : '';
  }

  async extractMemory(
    userMessage: string,
    _assistantResponse: string,
    sessionId: string,
    modelInstance: Parameters<typeof generateText>[0]['model'],
  ): Promise<number> {
    try {
      const state = this.getMemoryState(sessionId);

      const existingMemory: string[] = [];
      if (state.workingMemory) {
        existingMemory.push(`Working Memory: task="${state.workingMemory.task_description}", progress="${state.workingMemory.progress}"`);
      }
      if (state.profile.length > 0) {
        existingMemory.push(`Profile: ${state.profile.map((p) => `${p.key}=${p.value}`).join(', ')}`);
      }
      if (state.knowledge.length > 0) {
        existingMemory.push(`Knowledge: ${state.knowledge.map((k) => k.fact).join('; ')}`);
      }

      const existingContext = existingMemory.length > 0
        ? `EXISTING MEMORY:\n${existingMemory.join('\n')}`
        : 'EXISTING MEMORY: (empty)';

      const result = await generateText({
        model: modelInstance,
        system: MEMORY_EXTRACTION_PROMPT,
        prompt: `${existingContext}\n\nNEW USER MESSAGE: "${userMessage}"`,
      });

      const tokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

      // Parse JSON response
      const text = result.text.trim();
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const parsed = JSON.parse(jsonMatch[1]!.trim()) as MemoryExtractionResult;

      this.applyExtraction(sessionId, parsed);

      const updates: string[] = [];
      if (parsed.working_memory?.task_description) updates.push('working_memory');
      const profileAdds = parsed.profile.filter((p) => p.operation !== 'NOOP').length;
      if (profileAdds > 0) updates.push(`profile(${profileAdds})`);
      if (parsed.solutions) updates.push('solution');
      const knowledgeAdds = parsed.knowledge.filter((k) => k.operation === 'ADD').length;
      if (knowledgeAdds > 0) updates.push(`knowledge(${knowledgeAdds})`);

      console.log(
        `\x1b[35m[Memory]\x1b[0m Extracted: ${updates.length > 0 ? updates.join(', ') : 'no updates'} (${tokens} tokens)`,
      );

      return tokens;
    } catch (err) {
      console.log(
        `\x1b[33m[Memory]\x1b[0m Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  applyExtraction(sessionId: string, result: MemoryExtractionResult): void {
    // Working memory
    if (result.working_memory) {
      const wm = result.working_memory;
      if (wm.task_description || wm.progress || wm.hypotheses) {
        saveWorkingMemory(sessionId, wm.task_description, wm.progress, wm.hypotheses);
      }
    }

    // Profile
    for (const entry of result.profile) {
      if (entry.operation === 'ADD' || entry.operation === 'UPDATE') {
        saveProfileEntry(entry.key, entry.value);
      }
    }

    // Solutions
    if (result.solutions) {
      saveSolution(
        result.solutions.task,
        JSON.stringify(result.solutions.steps),
        result.solutions.outcome,
      );
    }

    // Knowledge
    for (const entry of result.knowledge) {
      if (entry.operation === 'ADD') {
        saveKnowledge(entry.fact, entry.source);
      }
    }
  }
}

export const memoryManager = new MemoryManager();
