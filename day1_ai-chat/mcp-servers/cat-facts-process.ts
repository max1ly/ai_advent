// mcp-servers/cat-facts-process.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { z } from 'zod';

const TAG = '\x1b[33m[Process MCP]\x1b[0m';

// --- Category keyword dictionaries ---
const CATEGORIES: Record<string, string[]> = {
  anatomy: ['whiskers', 'paws', 'claws', 'tail', 'fur', 'bones', 'skeleton', 'jaw', 'teeth', 'eye', 'ear', 'nose', 'tongue', 'leg', 'spine', 'muscle', 'brain', 'heart', 'lung'],
  behavior: ['sleep', 'hunt', 'purr', 'meow', 'play', 'groom', 'scratch', 'climb', 'land', 'jump', 'run', 'chase', 'hiss', 'knead', 'stalk', 'pounce', 'yawn', 'stretch'],
  history: ['ancient', 'egypt', 'century', 'medieval', 'worship', 'domesticated', 'ancestor', 'civilization', 'pharaoh', 'roman', 'goddess', 'mythology'],
  diet: ['eat', 'food', 'prey', 'mouse', 'fish', 'bird', 'milk', 'water', 'meat', 'feed', 'drink', 'hunt'],
  senses: ['smell', 'hear', 'vision', 'night', 'dark', 'see', 'sound', 'taste', 'whisker', 'detect', 'sense', 'perceive'],
  reproduction: ['kitten', 'litter', 'pregnant', 'birth', 'nurse', 'mate', 'breed', 'newborn', 'offspring', 'fertile'],
};

const SUPERLATIVES = ['most', 'largest', 'fastest', 'smallest', 'longest', 'only', 'first', 'never', 'always', 'every', 'best', 'worst', 'oldest', 'youngest'];

function detectCategory(factLower: string): string {
  let bestCategory = 'other';
  let bestCount = 0;
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    const count = keywords.filter((kw) => factLower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestCategory = category;
    }
  }
  return bestCategory;
}

function extractKeywords(factLower: string): string[] {
  const allKeywords = Object.values(CATEGORIES).flat();
  return [...new Set(allKeywords.filter((kw) => factLower.includes(kw)))];
}

function computeFunScore(fact: string, length: number): number {
  let score = 5;
  // Exclamation marks (max +2)
  const exclamations = (fact.match(/!/g) || []).length;
  score += Math.min(exclamations, 2);
  // Contains a number/statistic
  if (/\d/.test(fact)) score += 1;
  // Contains superlatives
  const factLower = fact.toLowerCase();
  if (SUPERLATIVES.some((s) => factLower.includes(s))) score += 1;
  // Unusually short or long
  if (length < 50 || length > 200) score += 1;
  return Math.max(1, Math.min(10, score));
}

interface RawFact {
  fact: string;
  length: number;
}

interface EnrichedFact extends RawFact {
  word_count: number;
  reading_time_seconds: number;
  category: string;
  keywords: string[];
  fun_score: number;
}

function enrichFact(raw: RawFact): EnrichedFact {
  const factLower = raw.fact.toLowerCase();
  const word_count = raw.fact.split(/\s+/).filter(Boolean).length;
  return {
    fact: raw.fact,
    length: raw.length,
    word_count,
    reading_time_seconds: Math.ceil(word_count / 3.5),
    category: detectCategory(factLower),
    keywords: extractKeywords(factLower),
    fun_score: computeFunScore(raw.fact, raw.length),
  };
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Cat Facts Process',
    version: '1.0.0',
  });

  server.tool(
    'process_cat_fact',
    'Enrich a raw cat fact with metadata: word count, reading time, category, keywords, and fun score',
    {
      fact: z.string().describe('The cat fact text'),
      length: z.number().describe('Character length of the fact'),
    },
    async ({ fact, length }) => {
      const enriched = enrichFact({ fact, length });
      return {
        content: [{ type: 'text', text: JSON.stringify(enriched) }],
      };
    },
  );

  return server;
}

const transports = new Map<string, SSEServerTransport>();
const PORT = parseInt(process.env.PORT || '3032', 10);

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
    res.end(JSON.stringify({ name: 'Cat Facts Process', version: '1.0.0', status: 'running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`${TAG} Server running on http://localhost:${PORT}`);
  console.log(`${TAG} SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`${TAG} Tools: process_cat_fact`);
});
