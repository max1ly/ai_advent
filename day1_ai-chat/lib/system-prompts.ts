import crypto from 'crypto';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

export interface SystemPrompt {
  id: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

// Reuse the same DB connection pattern as lib/db.ts
declare global {
  // eslint-disable-next-line no-var
  var _systemPromptsDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (globalThis._systemPromptsDb) return globalThis._systemPromptsDb;

  const dataDir = join(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });

  const db = new Database(join(dataDir, 'chat.db'));
  db.pragma('journal_mode = WAL');

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed with default prompt if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM system_prompts').get() as { cnt: number };
  if (count.cnt === 0) {
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO system_prompts (id, name, content, is_default) VALUES (?, ?, ?, 1)',
    ).run(id, 'Default Assistant', 'You are a helpful AI assistant.');
  }

  if (process.env.NODE_ENV !== 'production') {
    globalThis._systemPromptsDb = db;
  }

  return db;
}

export function getSystemPrompts(): SystemPrompt[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, name, content, is_default, created_at FROM system_prompts ORDER BY created_at',
  ).all() as { id: string; name: string; content: string; is_default: number; created_at: string }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    content: row.content,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  }));
}

export function getDefaultSystemPrompt(): SystemPrompt | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, name, content, is_default, created_at FROM system_prompts WHERE is_default = 1 LIMIT 1',
  ).get() as { id: string; name: string; content: string; is_default: number; created_at: string } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    content: row.content,
    isDefault: true,
    createdAt: row.created_at,
  };
}

export function saveSystemPrompt(name: string, content: string, isDefault?: boolean): string {
  const db = getDb();
  const id = crypto.randomUUID();

  if (isDefault) {
    db.prepare('UPDATE system_prompts SET is_default = 0').run();
  }

  db.prepare(
    'INSERT INTO system_prompts (id, name, content, is_default) VALUES (?, ?, ?, ?)',
  ).run(id, name, content, isDefault ? 1 : 0);

  return id;
}

export function deleteSystemPrompt(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM system_prompts WHERE id = ?').run(id);
}

export function setDefaultSystemPrompt(id: string): void {
  const db = getDb();
  db.prepare('UPDATE system_prompts SET is_default = 0').run();
  db.prepare('UPDATE system_prompts SET is_default = 1 WHERE id = ?').run(id);
}
