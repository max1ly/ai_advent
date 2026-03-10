import { describe, it, expect, beforeEach } from 'vitest';
import { McpManager } from '@/lib/mcp/manager';
import {
  getMcpServers,
  createMcpServer,
} from '@/lib/db';
import Database from 'better-sqlite3';
import { join } from 'path';

// Direct DB access for cleanup
const db = new Database(join(process.cwd(), 'data', 'chat.db'));

beforeEach(() => {
  db.prepare('DELETE FROM mcp_servers').run();
});

describe('McpManager', () => {
  it('initializes with no active connections', () => {
    const manager = new McpManager();

    expect(manager.getAllTools()).toEqual([]);
    expect(manager.getConnectedServers()).toEqual([]);
  });

  it('getServerStatuses returns all configured servers with disconnected status', () => {
    createMcpServer('server-a', 'stdio', JSON.stringify({ command: 'node', args: ['a.js'] }));
    createMcpServer('server-b', 'sse', JSON.stringify({ url: 'http://localhost:9090/sse' }));

    const manager = new McpManager();
    const statuses = manager.getServerStatuses();

    expect(statuses).toHaveLength(2);
    expect(statuses[0].name).toBe('server-a');
    expect(statuses[0].status).toBe('disconnected');
    expect(statuses[0].tools).toEqual([]);
    expect(statuses[0].transport).toBe('stdio');
    expect(statuses[0].enabled).toBe(true);

    expect(statuses[1].name).toBe('server-b');
    expect(statuses[1].status).toBe('disconnected');
    expect(statuses[1].tools).toEqual([]);
    expect(statuses[1].transport).toBe('sse');
  });

  it('getAllTools returns empty when nothing connected', () => {
    createMcpServer('server-a', 'stdio', JSON.stringify({ command: 'node', args: [] }));

    const manager = new McpManager();
    expect(manager.getAllTools()).toEqual([]);
  });

  it('getClient returns undefined for unknown server', () => {
    const manager = new McpManager();
    expect(manager.getClient('nonexistent')).toBeUndefined();
  });

  it('disconnect is a no-op for unknown server', async () => {
    const manager = new McpManager();
    // Should not throw
    await manager.disconnect('nonexistent');
  });

  it('callTool throws when server is not connected', async () => {
    const manager = new McpManager();
    await expect(
      manager.callTool('not-connected', 'some-tool', {}),
    ).rejects.toThrow('server "not-connected" is not connected');
  });

  it('connect throws for non-existent server ID', async () => {
    const manager = new McpManager();
    await expect(manager.connect('nonexistent-id')).rejects.toThrow(
      'MCP server not found: nonexistent-id',
    );
  });
});
