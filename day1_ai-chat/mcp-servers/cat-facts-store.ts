// mcp-servers/cat-facts-store.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const TAG = '\x1b[32m[Store MCP]\x1b[0m';

// --- SQLite setup ---
const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'chat.db'));
db.pragma('journal_mode = WAL');

// Drop old table if schema has changed (dev convenience — new columns added)
// The old table has: id, fact, length, collected_at
// The new table adds: word_count, reading_time_seconds, category, keywords, fun_score
const tableInfo = db.prepare("PRAGMA table_info('cat_facts')").all() as Array<{ name: string }>;
const columnNames = tableInfo.map((c) => c.name);
if (columnNames.length > 0 && !columnNames.includes('translated')) {
  console.log(`${TAG} Schema migration: dropping old cat_facts table (missing new columns)`);
  db.exec('DROP TABLE cat_facts');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS cat_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fact TEXT UNIQUE NOT NULL,
    length INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    reading_time_seconds INTEGER NOT NULL,
    category TEXT NOT NULL,
    keywords TEXT NOT NULL,
    fun_score INTEGER NOT NULL,
    translated TEXT,
    collected_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log(`${TAG} SQLite table ready (cat_facts)`);

const insertFact = db.prepare(
  `INSERT OR IGNORE INTO cat_facts (fact, length, word_count, reading_time_seconds, category, keywords, fun_score, translated)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

const summaryQuery = db.prepare(`
  SELECT
    COUNT(*) as facts_collected,
    COUNT(DISTINCT fact) as unique_facts,
    COALESCE(ROUND(AVG(length)), 0) as avg_length,
    COALESCE(MAX(length), 0) as longest_fact_length,
    COALESCE(MIN(length), 0) as shortest_fact_length,
    COALESCE(ROUND(AVG(fun_score), 1), 0) as avg_fun_score,
    COALESCE(ROUND(AVG(reading_time_seconds)), 0) as avg_reading_time_seconds,
    MAX(collected_at) as last_collected_at,
    COUNT(CASE WHEN translated IS NOT NULL THEN 1 END) as translated_count
  FROM cat_facts
`);

const categoryBreakdownQuery = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM cat_facts
  GROUP BY category
  ORDER BY count DESC
`);

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Cat Facts Store',
    version: '1.0.0',
  });

  server.tool(
    'store_cat_fact',
    'Store an enriched cat fact in the SQLite database',
    {
      fact: z.string().describe('The cat fact text'),
      length: z.number().describe('Character length of the fact'),
      word_count: z.number().describe('Number of words in the fact'),
      reading_time_seconds: z.number().describe('Estimated reading time in seconds'),
      category: z.string().describe('Detected category (anatomy, behavior, history, diet, senses, reproduction, other)'),
      keywords: z.array(z.string()).describe('Extracted keywords'),
      fun_score: z.number().describe('Fun score (1-10)'),
      translated: z.string().optional().describe('Russian translation of the fact (optional)'),
    },
    async ({ fact, length, word_count, reading_time_seconds, category, keywords, fun_score, translated }) => {
      const result = insertFact.run(fact, length, word_count, reading_time_seconds, category, JSON.stringify(keywords), fun_score, translated ?? null);
      if (result.changes > 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ stored: true, id: result.lastInsertRowid }) }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ stored: false, reason: 'duplicate' }) }],
      };
    },
  );

  server.tool(
    'get_cat_facts_summary',
    'Get aggregated statistics about all stored cat facts including category breakdown',
    async () => {
      const stats = summaryQuery.get() as {
        facts_collected: number;
        unique_facts: number;
        avg_length: number;
        longest_fact_length: number;
        shortest_fact_length: number;
        avg_fun_score: number;
        avg_reading_time_seconds: number;
        last_collected_at: string | null;
        translated_count: number;
      };
      const categories = categoryBreakdownQuery.all() as Array<{ category: string; count: number }>;
      const category_breakdown: Record<string, number> = {};
      for (const row of categories) {
        category_breakdown[row.category] = row.count;
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...stats, category_breakdown }) }],
      };
    },
  );

  return server;
}

const transports = new Map<string, SSEServerTransport>();
const PORT = parseInt(process.env.PORT || '3033', 10);

const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/sse' && req.method === 'GET') {
    const server = createMcpServer();
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => { transports.delete(transport.sessionId); };
    await server.connect(transport);
    return;
  }

  if (url.pathname === '/message' && req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) { res.writeHead(400); res.end('Missing sessionId'); return; }
    const transport = transports.get(sessionId);
    if (!transport) { res.writeHead(404); res.end('Session not found'); return; }
    await transport.handlePostMessage(req, res);
    return;
  }

  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'Cat Facts Store', version: '1.0.0', status: 'running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`${TAG} Server running on http://localhost:${PORT}`);
  console.log(`${TAG} SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`${TAG} Tools: store_cat_fact, get_cat_facts_summary`);
});
