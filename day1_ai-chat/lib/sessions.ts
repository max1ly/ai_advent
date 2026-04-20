import { ChatAgent } from '@/lib/agent';
import { saveMessage, getSessionMessages, saveFile } from '@/lib/db';
import type { ChatFile } from '@/lib/agent';
import type { StrategySettings } from '@/lib/types';
import { mcpManager } from '@/lib/mcp/manager';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface SessionEntry {
  agent: ChatAgent;
  lastAccessed: number;
}

const sessions = new Map<string, SessionEntry>();

function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastAccessed > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

const cleanupTimer = setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

export function getOrCreateAgent(
  sessionId: string | null,
  model?: string,
  strategy?: StrategySettings,
): { agent: ChatAgent; sessionId: string } {
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    entry.lastAccessed = Date.now();
    if (model) {
      entry.agent.setModel(model);
    }
    if (strategy) {
      entry.agent.setStrategy(strategy);
    }
    return { agent: entry.agent, sessionId };
  }

  const sid = sessionId ?? crypto.randomUUID();
  const rows = sessionId ? getSessionMessages(sessionId) : [];
  const history = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  const agent = new ChatAgent({
    model,
    sessionId: sid,
    history,
    strategy,
    mcpManager,
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

  sessions.set(sid, { agent, lastAccessed: Date.now() });
  return { agent, sessionId: sid };
}

export function getAgent(sessionId: string): ChatAgent | null {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  entry.lastAccessed = Date.now();
  return entry.agent;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Exported for testing — manually trigger stale session cleanup. */
export { cleanupStaleSessions, SESSION_TTL_MS, CLEANUP_INTERVAL_MS };
