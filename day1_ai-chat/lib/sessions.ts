import { ChatAgent } from '@/lib/agent';

const sessions = new Map<string, ChatAgent>();

export function getOrCreateAgent(
  sessionId: string | null,
  model?: string,
): { agent: ChatAgent; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    const agent = sessions.get(sessionId)!;
    if (model) {
      agent.setModel(model);
    }
    return { agent, sessionId };
  }

  const newId = crypto.randomUUID();
  const agent = new ChatAgent({ model });
  sessions.set(newId, agent);
  return { agent, sessionId: newId };
}
