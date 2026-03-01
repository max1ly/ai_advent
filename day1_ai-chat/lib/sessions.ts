import { ChatAgent } from '@/lib/agent';
import { saveMessage, getSessionMessages, saveFile } from '@/lib/db';
import type { ChatFile } from '@/lib/agent';
import type { StrategySettings } from '@/lib/types';

const sessions = new Map<string, ChatAgent>();

export function getOrCreateAgent(
  sessionId: string | null,
  model?: string,
  strategy?: StrategySettings,
): { agent: ChatAgent; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    const agent = sessions.get(sessionId)!;
    if (model) {
      agent.setModel(model);
    }
    if (strategy) {
      agent.setStrategy(strategy);
    }
    return { agent, sessionId };
  }

  const sid = sessionId ?? crypto.randomUUID();
  const rows = sessionId ? getSessionMessages(sessionId) : [];
  const history = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  const agent = new ChatAgent({
    model,
    history,
    strategy,
    onMessagePersist: (role: string, content: string, files?: ChatFile[]) => {
      const messageId = saveMessage(sid, role, content, model);
      if (files?.length) {
        for (const file of files) {
          const data = Buffer.from(file.data, 'base64');
          saveFile(messageId, sid, file.filename, file.mediaType, data);
        }
      }
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

export function getAgent(sessionId: string): ChatAgent | null {
  return sessions.get(sessionId) ?? null;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
