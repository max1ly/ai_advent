// lib/__tests__/cat-facts-server.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { McpClientWrapper } from '@/lib/mcp/client';
import type { McpSseConfig } from '@/lib/types';
import { ChildProcess, spawn } from 'node:child_process';

function startServer(script: string, port: number, readySignal = 'Server running'): Promise<ChildProcess> {
  return new Promise<ChildProcess>((resolve, reject) => {
    const proc = spawn(`npx tsx ${script}`, {
      env: { ...process.env, PORT: String(port) },
      stdio: 'pipe',
      shell: true,
    });
    const timeout = setTimeout(() => reject(new Error(`${script} start timeout`)), 10000);
    proc.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes(readySignal)) {
        clearTimeout(timeout);
        resolve(proc);
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`[${script} stderr]`, data.toString());
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function stopServer(proc: ChildProcess): Promise<void> {
  proc.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    proc.on('exit', () => resolve());
    setTimeout(resolve, 2000);
  });
}

// --- Fetch Server Tests ---
describe('Cat Facts Fetch MCP Server', () => {
  const PORT = 4031;
  const SSE_URL = `http://localhost:${PORT}/sse`;
  let serverProcess: ChildProcess;
  let client: McpClientWrapper;

  beforeAll(async () => {
    serverProcess = await startServer('mcp-servers/cat-facts-fetch.ts', PORT);
  }, 15000);

  afterEach(async () => { if (client) await client.disconnect(); });
  afterAll(async () => { if (serverProcess) await stopServer(serverProcess); });

  it('connects and lists 2 tools', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('fetch-test', 'Cat Facts Fetch', 'sse', config);
    const tools = await client.connect();
    expect(client.getStatus()).toBe('connected');
    expect(tools).toHaveLength(2);
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(['fetch_cat_facts_list', 'fetch_random_cat_fact']);
  }, 15000);

  it('calls fetch_random_cat_fact and returns a fact', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('fetch-test', 'Cat Facts Fetch', 'sse', config);
    await client.connect();
    const result = await client.callTool('fetch_random_cat_fact', {});
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');
    const parsed = JSON.parse(content[0].text);
    expect(typeof parsed.fact).toBe('string');
    expect(typeof parsed.length).toBe('number');
    console.log('Fetched cat fact:', parsed.fact);
  }, 15000);

  it('calls fetch_cat_facts_list with limit', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('fetch-test', 'Cat Facts Fetch', 'sse', config);
    await client.connect();
    const result = await client.callTool('fetch_cat_facts_list', { limit: 2 });
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const parsed = JSON.parse(content[0].text);
    expect(Array.isArray(parsed.facts)).toBe(true);
    expect(parsed.facts.length).toBeGreaterThan(0);
    expect(parsed.facts.length).toBeLessThanOrEqual(2);
  }, 15000);
});

// --- Process Server Tests ---
describe('Cat Facts Process MCP Server', () => {
  const PORT = 4032;
  const SSE_URL = `http://localhost:${PORT}/sse`;
  let serverProcess: ChildProcess;
  let client: McpClientWrapper;

  beforeAll(async () => {
    serverProcess = await startServer('mcp-servers/cat-facts-process.ts', PORT);
  }, 15000);

  afterEach(async () => { if (client) await client.disconnect(); });
  afterAll(async () => { if (serverProcess) await stopServer(serverProcess); });

  it('connects and lists 1 tool', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('process-test', 'Cat Facts Process', 'sse', config);
    const tools = await client.connect();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('process_cat_fact');
  }, 15000);

  it('enriches a cat fact with metadata', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('process-test', 'Cat Facts Process', 'sse', config);
    await client.connect();

    const result = await client.callTool('process_cat_fact', {
      fact: 'Cats sleep for 70% of their lives! They have amazing night vision.',
      length: 66,
    });
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const parsed = JSON.parse(content[0].text);

    expect(parsed.fact).toBe('Cats sleep for 70% of their lives! They have amazing night vision.');
    expect(parsed.length).toBe(66);
    expect(typeof parsed.word_count).toBe('number');
    expect(parsed.word_count).toBeGreaterThan(0);
    expect(typeof parsed.reading_time_seconds).toBe('number');
    expect(parsed.reading_time_seconds).toBeGreaterThan(0);
    expect(typeof parsed.category).toBe('string');
    expect(parsed.category).not.toBe('');
    expect(Array.isArray(parsed.keywords)).toBe(true);
    expect(typeof parsed.fun_score).toBe('number');
    expect(parsed.fun_score).toBeGreaterThanOrEqual(1);
    expect(parsed.fun_score).toBeLessThanOrEqual(10);

    // This fact mentions 'sleep' (behavior) and 'night'/'vision' (senses)
    expect(parsed.keywords).toContain('sleep');

    // Has exclamation + number → fun_score should be > 5
    expect(parsed.fun_score).toBeGreaterThan(5);

    console.log('Enriched fact:', parsed);
  }, 15000);
});

// --- Store Server Tests ---
describe('Cat Facts Store MCP Server', () => {
  const PORT = 4033;
  const SSE_URL = `http://localhost:${PORT}/sse`;
  let serverProcess: ChildProcess;
  let client: McpClientWrapper;

  beforeAll(async () => {
    serverProcess = await startServer('mcp-servers/cat-facts-store.ts', PORT);
  }, 15000);

  afterEach(async () => { if (client) await client.disconnect(); });
  afterAll(async () => { if (serverProcess) await stopServer(serverProcess); });

  it('connects and lists 2 tools', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('store-test', 'Cat Facts Store', 'sse', config);
    const tools = await client.connect();
    expect(tools).toHaveLength(2);
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(['get_cat_facts_summary', 'store_cat_fact']);
  }, 15000);

  it('stores an enriched fact and returns confirmation', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('store-test', 'Cat Facts Store', 'sse', config);
    await client.connect();

    const testFact = {
      fact: `Test fact for pipeline ${Date.now()}`,
      length: 30,
      word_count: 5,
      reading_time_seconds: 2,
      category: 'behavior',
      keywords: ['test'],
      fun_score: 7,
    };

    const result = await client.callTool('store_cat_fact', testFact);
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.stored).toBe(true);
    expect(typeof parsed.id).toBe('number');
    console.log('Stored fact with id:', parsed.id);
  }, 15000);

  it('returns summary statistics', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('store-test', 'Cat Facts Store', 'sse', config);
    await client.connect();

    const result = await client.callTool('get_cat_facts_summary', {});
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const parsed = JSON.parse(content[0].text);

    expect(typeof parsed.facts_collected).toBe('number');
    expect(typeof parsed.unique_facts).toBe('number');
    expect(typeof parsed.avg_length).toBe('number');
    expect(typeof parsed.avg_fun_score).toBe('number');
    expect(typeof parsed.avg_reading_time_seconds).toBe('number');
    expect(typeof parsed.category_breakdown).toBe('object');

    console.log('Cat facts summary:', parsed);
  }, 15000);

  it('rejects duplicate facts', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('store-test', 'Cat Facts Store', 'sse', config);
    await client.connect();

    const testFact = {
      fact: 'Duplicate test fact for dedup check',
      length: 35,
      word_count: 6,
      reading_time_seconds: 2,
      category: 'other',
      keywords: [],
      fun_score: 5,
    };

    // Store once
    await client.callTool('store_cat_fact', testFact);
    // Store again — should be duplicate
    const result = await client.callTool('store_cat_fact', testFact);
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.stored).toBe(false);
    expect(parsed.reason).toBe('duplicate');
  }, 15000);
});

// --- Translate Server Tests ---
describe('Cat Facts Translate MCP Server', () => {
  const PORT = 4034;
  const SSE_URL = `http://localhost:${PORT}/sse`;
  let serverProcess: ChildProcess;
  let client: McpClientWrapper;

  beforeAll(async () => {
    serverProcess = await startServer('mcp-servers/cat-facts-translate.ts', PORT);
  }, 15000);

  afterEach(async () => { if (client) await client.disconnect(); });
  afterAll(async () => { if (serverProcess) await stopServer(serverProcess); });

  it('connects and lists 1 tool', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('translate-test', 'Cat Facts Translate', 'sse', config);
    const tools = await client.connect();
    expect(client.getStatus()).toBe('connected');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('translate_cat_fact');
  }, 15000);

  it('translates a fact and returns original, translated, language fields', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('translate-test', 'Cat Facts Translate', 'sse', config);
    await client.connect();
    const result = await client.callTool('translate_cat_fact', { fact: 'Cats sleep for 16 hours a day.' });
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(content).toHaveLength(1);
    const parsed = JSON.parse(content[0].text);
    expect(parsed.original).toBe('Cats sleep for 16 hours a day.');
    expect(typeof parsed.translated).toBe('string');
    expect(parsed.translated.length).toBeGreaterThan(0);
    expect(parsed.language).toBe('ru');
    console.log('Translated fact:', parsed.translated);
  }, 15000);
});

// --- Display Server Tests ---
describe('Cat Facts Display MCP Server', () => {
  const PORT = 4035;
  const SSE_URL = `http://localhost:${PORT}/sse`;
  let serverProcess: ChildProcess;
  let client: McpClientWrapper;

  beforeAll(async () => {
    serverProcess = await startServer('mcp-servers/cat-facts-display.ts', PORT);
  }, 15000);

  afterEach(async () => { if (client) await client.disconnect(); });
  afterAll(async () => { if (serverProcess) await stopServer(serverProcess); });

  it('connects and lists 1 tool', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('display-test', 'Cat Facts Display', 'sse', config);
    const tools = await client.connect();
    expect(client.getStatus()).toBe('connected');
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('display_cat_fact');
  }, 15000);

  it('formats enriched fact as markdown', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('display-test', 'Cat Facts Display', 'sse', config);
    await client.connect();
    const result = await client.callTool('display_cat_fact', {
      fact: 'Cats have over 20 vocalizations.',
      length: 33,
      word_count: 6,
      reading_time_seconds: 2,
      category: 'behavior',
      keywords: ['vocalizations'],
      fun_score: 7,
    });
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.formatted).toContain('**Cat Fact**');
    expect(parsed.formatted).toContain('Cats have over 20 vocalizations.');
    expect(parsed.formatted).toContain('behavior');
    expect(parsed.formatted).toContain('vocalizations');
    expect(parsed.formatted).toContain('7/10');
    // No translation section when translated not provided
    expect(parsed.formatted).not.toContain('Translation (RU)');
    console.log('Formatted output:\n', parsed.formatted);
  }, 15000);
});
