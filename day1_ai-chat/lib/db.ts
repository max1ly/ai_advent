import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Prevent multiple connections during Next.js HMR (research finding #2)
declare global {
  var _db: Database.Database | undefined;
}

function createDatabase(): Database.Database {
  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });

  const db = new Database(join(dataDir, 'chat.db'));

  // WAL mode enables concurrent reads during streaming (research finding #3)
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = normal');
  db.pragma('temp_store = memory');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  `);

  console.log('\x1b[36m[DB]\x1b[0m SQLite initialized (WAL mode)');
  return db;
}

const db = globalThis._db ?? createDatabase();
if (process.env.NODE_ENV !== 'production') {
  globalThis._db = db;
}

export function saveMessage(
  sessionId: string,
  role: string,
  content: string,
  model?: string,
) {
  db.prepare(
    'INSERT INTO messages (session_id, role, content, model) VALUES (?, ?, ?, ?)',
  ).run(sessionId, role, content, model ?? null);
}

export function getSessionMessages(
  sessionId: string,
): { role: string; content: string; model: string | null; created_at: string }[] {
  return db.prepare(
    'SELECT role, content, model, created_at FROM messages WHERE session_id = ? ORDER BY id',
  ).all(sessionId) as {
    role: string;
    content: string;
    model: string | null;
    created_at: string;
  }[];
}
