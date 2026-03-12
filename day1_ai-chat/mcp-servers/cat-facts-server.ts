// mcp-servers/cat-facts-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

// --- SQLite setup (reuse existing chat.db) ---
const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'chat.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cat_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fact TEXT UNIQUE NOT NULL,
    length INTEGER NOT NULL,
    collected_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('\x1b[35m[Cat Facts MCP]\x1b[0m SQLite table ready (cat_facts)');

const insertFact = db.prepare(
  'INSERT OR IGNORE INTO cat_facts (fact, length) VALUES (?, ?)',
);

const summaryQuery = db.prepare(`
  SELECT
    COUNT(*) as facts_collected,
    COUNT(DISTINCT fact) as unique_facts,
    COALESCE(ROUND(AVG(length)), 0) as avg_length,
    COALESCE(MAX(length), 0) as longest_fact_length,
    COALESCE(MIN(length), 0) as shortest_fact_length,
    MAX(collected_at) as last_collected_at
  FROM cat_facts
`);

// --- Scheduler: fetch a random cat fact every 15 seconds ---
async function collectFact(): Promise<void> {
  try {
    const res = await fetch('https://catfact.ninja/fact');
    if (!res.ok) {
      console.error(`\x1b[35m[Cat Facts MCP]\x1b[0m Scheduler fetch failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { fact: string; length: number };
    const result = insertFact.run(data.fact, data.length);
    if (result.changes > 0) {
      console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m Collected new fact (${data.length} chars)`);
    } else {
      console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m Duplicate fact skipped`);
    }
  } catch (err) {
    console.error(`\x1b[35m[Cat Facts MCP]\x1b[0m Scheduler error:`, err);
  }
}

/**
 * Create a new McpServer instance with tools registered.
 * Each SSE session needs its own McpServer (SDK limitation: one transport per instance).
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Cat Facts',
    version: '1.0.0',
  });

  // Tool 1: random_cat_fact — no parameters, returns a single random cat fact
  server.tool(
    'random_cat_fact',
    'Get a random cat fact',
    async () => {
      const res = await fetch('https://catfact.ninja/fact');
      if (!res.ok) {
        return {
          content: [{ type: 'text', text: `Error fetching cat fact: ${res.status} ${res.statusText}` }],
          isError: true,
        };
      }
      const data = (await res.json()) as { fact: string; length: number };
      return {
        content: [{ type: 'text', text: JSON.stringify(data) }],
      };
    },
  );

  // Tool 2: cat_facts_list — takes a limit parameter, returns multiple cat facts
  server.tool(
    'cat_facts_list',
    'Get a list of cat facts',
    { limit: z.number().min(1).max(5).default(3).describe('Number of cat facts to return (1-5)') },
    async ({ limit }) => {
      const res = await fetch(`https://catfact.ninja/facts?limit=${limit}`);
      if (!res.ok) {
        return {
          content: [{ type: 'text', text: `Error fetching cat facts: ${res.status} ${res.statusText}` }],
          isError: true,
        };
      }
      const data = (await res.json()) as { data: Array<{ fact: string; length: number }> };
      return {
        content: [{ type: 'text', text: JSON.stringify({ facts: data.data, count: data.data.length }) }],
      };
    },
  );

  // Tool 3: get_cat_facts_summary — returns aggregated statistics
  server.tool(
    'get_cat_facts_summary',
    'Get aggregated statistics about collected cat facts (count, unique, avg/min/max length)',
    async () => {
      const row = summaryQuery.get() as {
        facts_collected: number;
        unique_facts: number;
        avg_length: number;
        longest_fact_length: number;
        shortest_fact_length: number;
        last_collected_at: string | null;
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(row) }],
      };
    },
  );

  return server;
}

// SSE transport over HTTP — track sessions for message routing
const transports = new Map<string, SSEServerTransport>();

const PORT = parseInt(process.env.PORT || '3031', 10);

const httpServer = createServer(async (req, res) => {
  // CORS headers for local dev
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
    // New SSE connection — each gets its own McpServer instance
    const server = createMcpServer();
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };
    await server.connect(transport);
    return;
  }

  if (url.pathname === '/message' && req.method === 'POST') {
    // Incoming JSON-RPC message
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      res.writeHead(400);
      res.end('Missing sessionId');
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404);
      res.end('Session not found');
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  // Health check / info
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'Cat Facts MCP Server', version: '1.0.0', status: 'running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m Server running on http://localhost:${PORT}`);
  console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m Tools: random_cat_fact, cat_facts_list, get_cat_facts_summary`);

  // Start periodic collection
  collectFact(); // initial fetch immediately
  setInterval(collectFact, 15_000);
  console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m Scheduler started (every 15s)`);
});
