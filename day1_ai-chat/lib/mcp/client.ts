import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type {
  McpTransport,
  McpStdioConfig,
  McpSseConfig,
  McpTool,
} from '@/lib/types';

type McpClientStatus = 'connected' | 'disconnected' | 'error';

const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

function log(message: string): void {
  console.log(`${MAGENTA}[MCP]${RESET} ${message}`);
}

export class McpClientWrapper {
  private client: Client | null = null;
  private status: McpClientStatus = 'disconnected';
  private tools: McpTool[] = [];
  private errorMessage: string | null = null;

  constructor(
    private readonly serverId: string,
    private readonly serverName: string,
    private readonly transportType: McpTransport,
    private readonly config: McpStdioConfig | McpSseConfig,
  ) {}

  async connect(): Promise<McpTool[]> {
    log(`Connecting to "${this.serverName}" (${this.transportType})...`);

    try {
      this.client = new Client(
        { name: 'day1-ai-chat', version: '0.1.0' },
        { capabilities: {} },
      );

      const transport = this.createTransport();
      await this.client.connect(transport);

      const result = await this.client.listTools();
      this.tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverId: this.serverId,
        serverName: this.serverName,
      }));

      this.status = 'connected';
      this.errorMessage = null;
      log(
        `Connected to "${this.serverName}" — ${this.tools.length} tool(s) available`,
      );

      return this.tools;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown connection error';
      this.setError(message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    log(`Disconnecting from "${this.serverName}"...`);

    try {
      if (this.client) {
        await this.client.close();
      }
    } catch (error) {
      log(
        `Error during disconnect: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.client = null;
      this.tools = [];
      this.status = 'disconnected';
      this.errorMessage = null;
      log(`Disconnected from "${this.serverName}"`);
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.client || this.status !== 'connected') {
      throw new Error(
        `Cannot call tool "${toolName}": not connected to "${this.serverName}"`,
      );
    }

    log(`Calling tool "${toolName}" on "${this.serverName}"...`);

    const result = await this.client.callTool({ name: toolName, arguments: args });
    return result;
  }

  setError(message: string): void {
    this.status = 'error';
    this.errorMessage = message;
    log(`Error on "${this.serverName}": ${message}`);
  }

  getStatus(): McpClientStatus {
    return this.status;
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  getServerId(): string {
    return this.serverId;
  }

  getServerName(): string {
    return this.serverName;
  }

  getTransport(): McpTransport {
    return this.transportType;
  }

  getError(): string | null {
    return this.errorMessage;
  }

  private createTransport(): StdioClientTransport | SSEClientTransport {
    if (this.transportType === 'stdio') {
      const stdioConfig = this.config as McpStdioConfig;
      return new StdioClientTransport({
        command: stdioConfig.command,
        args: stdioConfig.args,
        env: stdioConfig.env,
      });
    }

    const sseConfig = this.config as McpSseConfig;
    return new SSEClientTransport(new URL(sseConfig.url));
  }
}
