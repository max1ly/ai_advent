import { ChatAgent } from '@/lib/agent';
import { saveMessage, getSessionMessages } from '@/lib/db';

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

  // New session or server restarted — check SQLite for existing messages
  const sid = sessionId ?? crypto.randomUUID();
  const rows = sessionId ? getSessionMessages(sessionId) : [];
  const history = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  const agent = new ChatAgent({
    model,
    history,
    onMessagePersist: (role, content) => {
      saveMessage(sid, role, content, model);
    },
  });

  if (history.length > 0) {
    console.log(
      `\x1b[36m[Sessions]\x1b[0m Restored ${history.length} messages for session ${sid.slice(0, 8)}…`,
    );
  }

  sessions.set(sid, agent);
  return { agent, sessionId: sid };
}
