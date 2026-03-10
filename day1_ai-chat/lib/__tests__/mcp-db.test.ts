import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMcpServers,
  getMcpServer,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
} from '@/lib/db';
import Database from 'better-sqlite3';
import { join } from 'path';

// Direct DB access for cleanup
const db = new Database(join(process.cwd(), 'data', 'chat.db'));

beforeEach(() => {
  db.prepare('DELETE FROM mcp_servers').run();
});

describe('MCP Servers CRUD', () => {
  it('creates and retrieves a stdio server', () => {
    const config = JSON.stringify({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] });
    const id = createMcpServer('filesystem', 'stdio', config);

    expect(id).toBeTruthy();
    const server = getMcpServer(id);
    expect(server).not.toBeNull();
    expect(server!.name).toBe('filesystem');
    expect(server!.transport).toBe('stdio');
    expect(server!.config).toBe(config);
    expect(server!.enabled).toBe(1);
    expect(server!.created_at).toBeTruthy();
  });

  it('creates and retrieves an SSE server', () => {
    const config = JSON.stringify({ url: 'http://localhost:8080/sse' });
    const id = createMcpServer('remote-tools', 'sse', config);

    const server = getMcpServer(id);
    expect(server).not.toBeNull();
    expect(server!.name).toBe('remote-tools');
    expect(server!.transport).toBe('sse');
    expect(server!.config).toBe(config);
  });

  it('lists all servers', () => {
    createMcpServer('server-a', 'stdio', '{}');
    createMcpServer('server-b', 'sse', '{}');
    createMcpServer('server-c', 'stdio', '{}');

    const servers = getMcpServers();
    expect(servers).toHaveLength(3);
    // ordered by created_at
    expect(servers[0].name).toBe('server-a');
    expect(servers[1].name).toBe('server-b');
    expect(servers[2].name).toBe('server-c');
  });

  it('updates server name and enabled status', () => {
    const id = createMcpServer('old-name', 'stdio', '{}');
    updateMcpServer(id, { name: 'new-name', enabled: 0 });

    const server = getMcpServer(id);
    expect(server!.name).toBe('new-name');
    expect(server!.enabled).toBe(0);
    // transport should be unchanged
    expect(server!.transport).toBe('stdio');
  });

  it('updates server config', () => {
    const id = createMcpServer('test', 'stdio', '{"old": true}');
    updateMcpServer(id, { config: '{"new": true}' });

    const server = getMcpServer(id);
    expect(server!.config).toBe('{"new": true}');
  });

  it('deletes a server', () => {
    const id = createMcpServer('to-delete', 'stdio', '{}');
    expect(getMcpServer(id)).not.toBeNull();

    deleteMcpServer(id);
    expect(getMcpServer(id)).toBeNull();
  });

  it('returns null for unknown server', () => {
    expect(getMcpServer('nonexistent-id')).toBeNull();
  });
});
