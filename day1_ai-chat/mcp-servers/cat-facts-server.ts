// mcp-servers/cat-facts-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { z } from 'zod';

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
  console.log(`\x1b[35m[Cat Facts MCP]\x1b[0m Tools: random_cat_fact, cat_facts_list`);
});
