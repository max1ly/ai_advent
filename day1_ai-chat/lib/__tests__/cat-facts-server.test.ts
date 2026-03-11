// lib/__tests__/cat-facts-server.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { McpClientWrapper } from '@/lib/mcp/client';
import type { McpSseConfig } from '@/lib/types';
import { ChildProcess, spawn } from 'node:child_process';

const PORT = 3032; // Use different port to avoid conflicts
const SSE_URL = `http://localhost:${PORT}/sse`;

describe('Cat Facts MCP Server (SSE integration)', () => {
  let serverProcess: ChildProcess;
  let client: McpClientWrapper;

  beforeAll(async () => {
    // Start the cat-facts server as a child process on a test port
    serverProcess = spawn('npx tsx mcp-servers/cat-facts-server.ts', {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
      shell: true,
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
      serverProcess.stdout?.on('data', (data: Buffer) => {
        if (data.toString().includes('Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }, 15000);

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(resolve, 2000);
      });
    }
  });

  it('connects and lists 2 tools', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('cat-test', 'Cat Facts', 'sse', config);

    const tools = await client.connect();

    expect(client.getStatus()).toBe('connected');
    expect(tools).toHaveLength(2);

    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(['cat_facts_list', 'random_cat_fact']);

    // Verify tool metadata
    const randomFact = tools.find((t) => t.name === 'random_cat_fact')!;
    expect(randomFact.description).toBe('Get a random cat fact');
    expect(randomFact.serverId).toBe('cat-test');
    expect(randomFact.serverName).toBe('Cat Facts');
  }, 15000);

  it('calls random_cat_fact and returns a fact', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('cat-test', 'Cat Facts', 'sse', config);
    await client.connect();

    const result = await client.callTool('random_cat_fact', {});
    expect(result).toBeDefined();

    // Result should have content array with text
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe('text');

    const parsed = JSON.parse(content[0].text);
    expect(parsed.fact).toBeTruthy();
    expect(typeof parsed.fact).toBe('string');
    expect(typeof parsed.length).toBe('number');

    console.log('Random cat fact:', parsed.fact);
  }, 15000);

  it('calls cat_facts_list with limit', async () => {
    const config: McpSseConfig = { url: SSE_URL };
    client = new McpClientWrapper('cat-test', 'Cat Facts', 'sse', config);
    await client.connect();

    const result = await client.callTool('cat_facts_list', { limit: 2 });
    expect(result).toBeDefined();

    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(content).toHaveLength(1);

    const parsed = JSON.parse(content[0].text);
    expect(parsed.facts).toBeDefined();
    expect(Array.isArray(parsed.facts)).toBe(true);
    expect(parsed.facts.length).toBeGreaterThan(0);
    expect(parsed.facts.length).toBeLessThanOrEqual(2);
    expect(parsed.count).toBe(parsed.facts.length);

    console.log(`Got ${parsed.count} cat facts`);
    for (const f of parsed.facts) {
      console.log(`  - ${f.fact}`);
    }
  }, 15000);
});
