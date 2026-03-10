import { describe, it, expect } from 'vitest';
import { McpClientWrapper } from '@/lib/mcp/client';
import type { McpSseConfig, McpStdioConfig } from '@/lib/types';

describe('McpClientWrapper', () => {
  const stdioConfig: McpStdioConfig = {
    command: 'node',
    args: ['server.js'],
    env: { NODE_ENV: 'test' },
  };

  const sseConfig: McpSseConfig = {
    url: 'http://localhost:8080/sse',
    headers: { Authorization: 'Bearer test-token' },
  };

  it('initializes with disconnected status', () => {
    const wrapper = new McpClientWrapper(
      'test-server',
      'Test Server',
      'stdio',
      stdioConfig,
    );

    expect(wrapper.getStatus()).toBe('disconnected');
    expect(wrapper.getTools()).toEqual([]);
    expect(wrapper.getError()).toBeNull();
    expect(wrapper.getServerId()).toBe('test-server');
    expect(wrapper.getServerName()).toBe('Test Server');
    expect(wrapper.getTransport()).toBe('stdio');
  });

  it('stores SSE config correctly', () => {
    const wrapper = new McpClientWrapper(
      'sse-server',
      'SSE Server',
      'sse',
      sseConfig,
    );

    expect(wrapper.getServerId()).toBe('sse-server');
    expect(wrapper.getServerName()).toBe('SSE Server');
    expect(wrapper.getTransport()).toBe('sse');
    expect(wrapper.getStatus()).toBe('disconnected');
  });

  it('exposes error when set', () => {
    const wrapper = new McpClientWrapper(
      'test-server',
      'Test Server',
      'stdio',
      stdioConfig,
    );

    expect(wrapper.getError()).toBeNull();
    expect(wrapper.getStatus()).toBe('disconnected');

    wrapper.setError('Connection refused');

    expect(wrapper.getError()).toBe('Connection refused');
    expect(wrapper.getStatus()).toBe('error');
  });

  it('throws when calling tool while disconnected', async () => {
    const wrapper = new McpClientWrapper(
      'test-server',
      'Test Server',
      'stdio',
      stdioConfig,
    );

    await expect(
      wrapper.callTool('some-tool', { arg: 'value' }),
    ).rejects.toThrow('Cannot call tool "some-tool": not connected');
  });
});
