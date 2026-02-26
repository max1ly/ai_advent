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

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      media_type TEXT NOT NULL,
      data BLOB NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_files_session ON files(session_id);
    CREATE INDEX IF NOT EXISTS idx_files_message ON files(message_id);
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
): number {
  const result = db.prepare(
    'INSERT INTO messages (session_id, role, content, model) VALUES (?, ?, ?, ?)',
  ).run(sessionId, role, content, model ?? null);
  return Number(result.lastInsertRowid);
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

export function saveFile(
  messageId: number,
  sessionId: string,
  filename: string,
  mediaType: string,
  data: Buffer,
): number {
  const result = db.prepare(
    'INSERT INTO files (message_id, session_id, filename, media_type, data, size) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(messageId, sessionId, filename, mediaType, data, data.length);
  return Number(result.lastInsertRowid);
}

export function getFile(
  id: number,
): { filename: string; media_type: string; data: Buffer; size: number } | null {
  return db.prepare(
    'SELECT filename, media_type, data, size FROM files WHERE id = ?',
  ).get(id) as { filename: string; media_type: string; data: Buffer; size: number } | null;
}

export function getMessageFiles(
  messageId: number,
): { id: number; filename: string; media_type: string; size: number }[] {
  return db.prepare(
    'SELECT id, filename, media_type, size FROM files WHERE message_id = ?',
  ).all(messageId) as { id: number; filename: string; media_type: string; size: number }[];
}

export function getSessionMessagesWithFiles(
  sessionId: string,
): { id: number; role: string; content: string; model: string | null; created_at: string; files: { id: number; filename: string; media_type: string; size: number }[] }[] {
  const messages = db.prepare(
    'SELECT id, role, content, model, created_at FROM messages WHERE session_id = ? ORDER BY id',
  ).all(sessionId) as { id: number; role: string; content: string; model: string | null; created_at: string }[];

  return messages.map((m) => ({
    ...m,
    files: getMessageFiles(m.id),
  }));
}
