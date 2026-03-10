import { describe, it, expect, afterEach } from 'vitest';
import { McpClientWrapper } from '@/lib/mcp/client';
import type { McpStdioConfig } from '@/lib/types';

const SERVER_CONFIG: McpStdioConfig = {
  command: 'node',
  args: ['node_modules/@modelcontextprotocol/server-everything/dist/index.js'],
};

describe('MCP Integration (real stdio server)', () => {
  let client: McpClientWrapper;

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  it('connects to server-everything and lists tools', async () => {
    client = new McpClientWrapper('test-id', 'Everything', 'stdio', SERVER_CONFIG);

    const tools = await client.connect();

    expect(client.getStatus()).toBe('connected');
    expect(tools.length).toBeGreaterThan(0);

    // Verify tool shape
    const firstTool = tools[0];
    expect(firstTool.name).toBeTruthy();
    expect(firstTool.serverId).toBe('test-id');
    expect(firstTool.serverName).toBe('Everything');
    expect(firstTool.inputSchema).toBeDefined();

    console.log(`Connected! ${tools.length} tools available:`);
    for (const t of tools) {
      console.log(`  - ${t.name}: ${t.description || '(no description)'}`);
    }
  }, 30000);

  it('calls the echo tool', async () => {
    client = new McpClientWrapper('test-id', 'Everything', 'stdio', SERVER_CONFIG);
    await client.connect();

    const result = await client.callTool('echo', { message: 'hello MCP' });
    expect(result).toBeDefined();
    console.log('Echo result:', JSON.stringify(result, null, 2));
  }, 30000);

  it('disconnects cleanly', async () => {
    client = new McpClientWrapper('test-id', 'Everything', 'stdio', SERVER_CONFIG);
    await client.connect();
    expect(client.getStatus()).toBe('connected');

    await client.disconnect();
    expect(client.getStatus()).toBe('disconnected');
    expect(client.getTools()).toEqual([]);
  }, 30000);

  it('handles connection to nonexistent server', async () => {
    const config: McpStdioConfig = {
      command: 'nonexistent-binary-that-does-not-exist',
      args: [],
    };
    client = new McpClientWrapper('bad-id', 'Bad Server', 'stdio', config);

    await expect(client.connect()).rejects.toThrow();
    expect(client.getStatus()).toBe('error');
    expect(client.getError()).toBeTruthy();
  }, 10000);
});
