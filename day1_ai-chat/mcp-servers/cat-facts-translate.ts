// mcp-servers/cat-facts-translate.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'node:http';
import { z } from 'zod';

const TAG = '\x1b[35m[Translate MCP]\x1b[0m';

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Cat Facts Translate',
    version: '1.0.0',
  });

  server.tool(
    'translate_cat_fact',
    'Translate an English cat fact to Russian using MyMemory API',
    {
      fact: z.string().describe('The cat fact text to translate'),
    },
    async ({ fact }) => {
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(fact)}&langpair=en|ru`;
        const res = await fetch(url);
        const data = await res.json() as {
          responseData: { translatedText: string; match: number };
          quotaFinished: boolean;
          responseStatus: number;
          responseDetails: string;
        };

        if (data.responseStatus === 200 && !data.quotaFinished) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              original: fact,
              translated: data.responseData.translatedText,
              language: 'ru',
            }) }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({
            original: fact,
            translated: fact,
            language: 'en',
            error: data.quotaFinished ? 'quota exhausted' : `translation failed: ${data.responseDetails}`,
          }) }],
        };
      } catch {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            original: fact,
            translated: fact,
            language: 'en',
            error: 'network error',
          }) }],
        };
      }
    },
  );

  return server;
}

const transports = new Map<string, SSEServerTransport>();
const PORT = parseInt(process.env.PORT || '3034', 10);

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
    res.end(JSON.stringify({ name: 'Cat Facts Translate', version: '1.0.0', status: 'running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

httpServer.listen(PORT, () => {
  console.log(`${TAG} Server running on http://localhost:${PORT}`);
  console.log(`${TAG} SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`${TAG} Tools: translate_cat_fact`);
});
