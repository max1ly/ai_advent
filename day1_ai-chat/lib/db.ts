import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type { TaskState } from '@/lib/types';

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

    CREATE TABLE IF NOT EXISTS working_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      task_description TEXT NOT NULL DEFAULT '',
      progress TEXT NOT NULL DEFAULT '',
      hypotheses TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      steps TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL DEFAULT 'conversation',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_state (
      session_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      paused INTEGER NOT NULL DEFAULT 0,
      task_description TEXT,
      plan TEXT NOT NULL DEFAULT '[]',
      current_step INTEGER NOT NULL DEFAULT 0,
      step_results TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
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

// --- Working Memory ---

export function getWorkingMemory(
  sessionId: string,
): { id: number; session_id: string; task_description: string; progress: string; hypotheses: string; updated_at: string } | null {
  const row = db.prepare(
    'SELECT id, session_id, task_description, progress, hypotheses, updated_at FROM working_memory WHERE session_id = ?',
  ).get(sessionId) as { id: number; session_id: string; task_description: string; progress: string; hypotheses: string; updated_at: string } | undefined;
  return row ?? null;
}

export function saveWorkingMemory(
  sessionId: string,
  taskDescription: string,
  progress: string,
  hypotheses: string,
): void {
  db.prepare(
    'INSERT INTO working_memory (session_id, task_description, progress, hypotheses) VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET task_description = ?, progress = ?, hypotheses = ?, updated_at = datetime(\'now\')',
  ).run(sessionId, taskDescription, progress, hypotheses, taskDescription, progress, hypotheses);
}

export function clearWorkingMemory(sessionId: string): void {
  db.prepare('DELETE FROM working_memory WHERE session_id = ?').run(sessionId);
}

// --- Profile (LTM) ---

export function getProfile(): { id: number; key: string; value: string; created_at: string; updated_at: string }[] {
  return db.prepare(
    'SELECT id, key, value, created_at, updated_at FROM memory_profile ORDER BY key',
  ).all() as { id: number; key: string; value: string; created_at: string; updated_at: string }[];
}

export function saveProfileEntry(key: string, value: string): void {
  db.prepare(
    'INSERT INTO memory_profile (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime(\'now\')',
  ).run(key, value, value);
}

export function deleteProfileEntry(key: string): void {
  db.prepare('DELETE FROM memory_profile WHERE key = ?').run(key);
}

// --- Solutions (LTM) ---

export function getSolutions(): { id: number; task: string; steps: string; outcome: string; created_at: string }[] {
  return db.prepare(
    'SELECT id, task, steps, outcome, created_at FROM memory_solutions ORDER BY created_at DESC',
  ).all() as { id: number; task: string; steps: string; outcome: string; created_at: string }[];
}

export function saveSolution(task: string, steps: string, outcome: string): void {
  db.prepare(
    'INSERT INTO memory_solutions (task, steps, outcome) VALUES (?, ?, ?)',
  ).run(task, steps, outcome);
}

export function deleteSolution(id: number): void {
  db.prepare('DELETE FROM memory_solutions WHERE id = ?').run(id);
}

// --- Knowledge (LTM) ---

export function getKnowledge(): { id: number; fact: string; source: string; created_at: string }[] {
  return db.prepare(
    'SELECT id, fact, source, created_at FROM memory_knowledge ORDER BY created_at DESC',
  ).all() as { id: number; fact: string; source: string; created_at: string }[];
}

export function saveKnowledge(fact: string, source: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO memory_knowledge (fact, source) VALUES (?, ?)',
  ).run(fact, source);
}

export function deleteKnowledge(id: number): void {
  db.prepare('DELETE FROM memory_knowledge WHERE id = ?').run(id);
}

// --- Clear all memory ---

export function clearAllMemory(): void {
  db.prepare('DELETE FROM working_memory').run();
  db.prepare('DELETE FROM memory_profile').run();
  db.prepare('DELETE FROM memory_solutions').run();
  db.prepare('DELETE FROM memory_knowledge').run();
}

// --- User Profiles ---

export function getProfiles(): { id: number; name: string; description: string; created_at: string }[] {
  return db.prepare(
    'SELECT id, name, description, created_at FROM user_profiles ORDER BY name',
  ).all() as { id: number; name: string; description: string; created_at: string }[];
}

export function getProfileById(id: number): { id: number; name: string; description: string; created_at: string } | null {
  const row = db.prepare(
    'SELECT id, name, description, created_at FROM user_profiles WHERE id = ?',
  ).get(id) as { id: number; name: string; description: string; created_at: string } | undefined;
  return row ?? null;
}

export function createProfile(name: string, description: string): number {
  const result = db.prepare(
    'INSERT INTO user_profiles (name, description) VALUES (?, ?)',
  ).run(name, description);
  return Number(result.lastInsertRowid);
}

export function deleteProfile(id: number): void {
  db.prepare('DELETE FROM user_profiles WHERE id = ?').run(id);
}

// --- Task State ---

export function getTaskState(sessionId: string): TaskState | null {
  const row = db.prepare(
    'SELECT session_id, status, paused, task_description, plan, current_step, step_results, summary, updated_at FROM task_state WHERE session_id = ?',
  ).get(sessionId) as {
    session_id: string;
    status: string;
    paused: number;
    task_description: string | null;
    plan: string;
    current_step: number;
    step_results: string;
    summary: string | null;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  return {
    sessionId: row.session_id,
    status: row.status as TaskState['status'],
    paused: row.paused === 1,
    taskDescription: row.task_description,
    plan: JSON.parse(row.plan),
    currentStep: row.current_step,
    stepResults: JSON.parse(row.step_results),
    summary: row.summary,
    updatedAt: row.updated_at,
  };
}

export function saveTaskState(state: TaskState): void {
  db.prepare(
    `INSERT INTO task_state (session_id, status, paused, task_description, plan, current_step, step_results, summary, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id) DO UPDATE SET
       status = ?, paused = ?, task_description = ?, plan = ?, current_step = ?, step_results = ?, summary = ?, updated_at = datetime('now')`,
  ).run(
    state.sessionId, state.status, state.paused ? 1 : 0, state.taskDescription,
    JSON.stringify(state.plan), state.currentStep, JSON.stringify(state.stepResults), state.summary,
    state.status, state.paused ? 1 : 0, state.taskDescription,
    JSON.stringify(state.plan), state.currentStep, JSON.stringify(state.stepResults), state.summary,
  );
}

export function deleteTaskState(sessionId: string): void {
  db.prepare('DELETE FROM task_state WHERE session_id = ?').run(sessionId);
}
