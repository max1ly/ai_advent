import { McpClientWrapper } from '@/lib/mcp/client';
import { getMcpServers, getMcpServer } from '@/lib/db';
import type {
  McpTransport,
  McpStdioConfig,
  McpSseConfig,
  McpTool,
  McpServerStatus,
} from '@/lib/types';

export class McpManager {
  private clients: Map<string, McpClientWrapper> = new Map();

  getServerStatuses(): McpServerStatus[] {
    const rows = getMcpServers();

    return rows.map((row) => {
      const client = this.clients.get(row.id);
      const config = JSON.parse(row.config) as McpStdioConfig | McpSseConfig;

      const base = {
        id: row.id,
        name: row.name,
        transport: row.transport as McpTransport,
        config,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
      };

      if (client) {
        return {
          ...base,
          status: client.getStatus(),
          error: client.getError() ?? undefined,
          tools: client.getTools(),
        };
      }

      return {
        ...base,
        status: 'disconnected' as const,
        tools: [],
      };
    });
  }

  async connect(serverId: string): Promise<McpTool[]> {
    // Disconnect existing client if present
    if (this.clients.has(serverId)) {
      await this.disconnect(serverId);
    }

    const row = getMcpServer(serverId);
    if (!row) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    const config = JSON.parse(row.config) as McpStdioConfig | McpSseConfig;
    const client = new McpClientWrapper(
      row.id,
      row.name,
      row.transport as McpTransport,
      config,
    );

    this.clients.set(serverId, client);

    try {
      const tools = await client.connect();
      return tools;
    } catch (error) {
      // Keep client in map with error status (setError already called by client)
      throw error;
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnects = Array.from(this.clients.keys()).map((id) =>
      this.disconnect(id),
    );
    await Promise.all(disconnects);
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(
        `Cannot call tool "${toolName}": server "${serverId}" is not connected`,
      );
    }
    return client.callTool(toolName, args);
  }

  getAllTools(): McpTool[] {
    const tools: McpTool[] = [];
    for (const client of this.clients.values()) {
      if (client.getStatus() === 'connected') {
        tools.push(...client.getTools());
      }
    }
    return tools;
  }

  getConnectedServers(): string[] {
    const ids: string[] = [];
    for (const [id, client] of this.clients) {
      if (client.getStatus() === 'connected') {
        ids.push(id);
      }
    }
    return ids;
  }

  getClient(serverId: string): McpClientWrapper | undefined {
    return this.clients.get(serverId);
  }

  /**
   * Find a connected server that has the given tool name and call it.
   * Used when the client doesn't know the serverId (tool-call events only have tool name).
   */
  async callToolByName(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    for (const client of this.clients.values()) {
      if (client.getStatus() !== 'connected') continue;
      const tool = client.getTools().find((t) => t.name === toolName);
      if (tool) {
        return client.callTool(toolName, args);
      }
    }
    throw new Error(`No connected server has tool "${toolName}"`);
  }

  /**
   * Auto-connect all enabled servers that aren't already connected.
   * Called on singleton creation and can be called on app startup.
   * Errors are logged but don't throw — partial connectivity is fine.
   */
  async autoConnectEnabled(): Promise<void> {
    const rows = getMcpServers();
    const enabled = rows.filter((r) => r.enabled === 1);

    if (enabled.length === 0) return;

    console.log(`\x1b[35m[MCP]\x1b[0m Auto-connecting ${enabled.length} enabled server(s)...`);

    const results = await Promise.allSettled(
      enabled.map(async (row) => {
        // Skip if already connected
        const existing = this.clients.get(row.id);
        if (existing?.getStatus() === 'connected') return;

        await this.connect(row.id);
      }),
    );

    const connected = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    console.log(`\x1b[35m[MCP]\x1b[0m Auto-connect: ${connected} connected, ${failed} failed`);
  }
}

// Singleton with HMR protection
declare global {
  var _mcpManager: McpManager | undefined;
}

const isNew = !globalThis._mcpManager;
export const mcpManager = globalThis._mcpManager ?? new McpManager();
if (process.env.NODE_ENV !== 'production') {
  globalThis._mcpManager = mcpManager;
}

// Auto-connect enabled servers on first creation
if (isNew) {
  mcpManager.autoConnectEnabled().catch((err) =>
    console.log('\x1b[31m[MCP]\x1b[0m Auto-connect failed:', err.message),
  );
}
