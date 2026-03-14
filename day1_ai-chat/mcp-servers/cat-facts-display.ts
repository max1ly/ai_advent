// mcp-servers/cat-facts-display.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { z } from 'zod';

const TAG = '\x1b[34m[Display MCP]\x1b[0m';

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Cat Facts Display',
    version: '1.0.0',
  });

  server.tool(
    'display_cat_fact',
    'Format an enriched cat fact as beautiful markdown for chat display',
    {
      fact: z.string().describe('The cat fact text'),
      length: z.number().describe('Character length'),
      word_count: z.number().describe('Word count'),
      reading_time_seconds: z.number().describe('Reading time in seconds'),
      category: z.string().describe('Fact category'),
      keywords: z.array(z.string()).describe('Keywords'),
      fun_score: z.number().describe('Fun score 1-10'),
      translated: z.string().optional().describe('Russian translation (if available)'),
    },
    async ({ fact, word_count, reading_time_seconds, category, keywords, fun_score, translated }) => {
      let markdown = `**Cat Fact**\n\n> ${fact}\n\n`;
      markdown += `**Stats:** ${word_count} words | ${reading_time_seconds}s read | Category: ${category} | Fun: ${fun_score}/10\n`;
      markdown += `**Keywords:** ${keywords.join(', ')}\n`;

      if (translated) {
        markdown += `\n**Translation (RU):** ${translated}\n`;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ formatted: markdown }) }],
      };
    },
  );

  return server;
}

const transports = new Map<string, SSEServerTransport>();
const PORT = parseInt(process.env.PORT || '3035', 10);

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
    res.end(JSON.stringify({ name: 'Cat Facts Display', version: '1.0.0', status: 'running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`${TAG} Server running on http://localhost:${PORT}`);
  console.log(`${TAG} SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`${TAG} Tools: display_cat_fact`);
});
