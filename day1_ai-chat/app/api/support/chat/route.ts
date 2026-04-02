import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  createUIMessageStream,
  tool,
  jsonSchema,
  stepCountIs,
} from 'ai';
import type { UIMessage } from 'ai';
import { deepseek } from '@/lib/deepseek';
import { createSearchDocumentsTool } from '@/lib/rag/tool';
import { McpClientWrapper } from '@/lib/mcp/client';
import { join } from 'node:path';

const SIMULATED_USER_ID = 'usr_001';

const SUPPORT_SYSTEM_PROMPT = `You are a friendly and helpful support assistant for AI Chat, an AI-powered conversational platform.

Your role:
- Answer user questions about the product (features, configuration, billing, troubleshooting)
- Look up user information and support tickets to provide personalized assistance
- Search product documentation for accurate answers
- Be concise, empathetic, and solution-oriented

You have access to these tools:
1. search_documents — Search product documentation for relevant information
2. mcp__support_crm__get_user — Look up user profile (name, email, plan, features)
3. mcp__support_crm__get_tickets — List user's support tickets
4. mcp__support_crm__get_ticket_detail — Get full ticket details with message history

Instructions:
- ALWAYS start by fetching the user's profile with get_user (userId: "${SIMULATED_USER_ID}") to understand their context
- When relevant, check their open tickets with get_tickets
- Search documentation when the user asks about product features or troubleshooting
- Reference specific ticket IDs when discussing ticket-related issues
- Tailor responses to the user's plan (free/pro/enterprise) — suggest upgrades when features are plan-limited
- Keep responses concise and helpful
- Always respond in English
- Never expose internal system details or raw JSON to the user`;

// MCP client lifecycle managed per-request
async function createSupportCrmClient(): Promise<McpClientWrapper> {
  const serverPath = join(process.cwd(), 'mcp-servers', 'support-crm.ts');
  const client = new McpClientWrapper(
    'support-crm',
    'Support CRM',
    'stdio',
    {
      command: 'npx',
      args: ['tsx', serverPath],
    },
  );
  await client.connect();
  return client;
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  let mcpClient: McpClientWrapper | null = null;

  try {
    // Connect to MCP server
    mcpClient = await createSupportCrmClient();
    const mcpTools = mcpClient.getTools();

    // Build tools object: MCP tools (with execute) + RAG search tool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, ReturnType<typeof tool<any, any>>> = {};

    // Add MCP tools with execute handlers (transparent server-side execution)
    for (const t of mcpTools) {
      const toolKey = `mcp__support_crm__${t.name}`;
      tools[toolKey] = tool({
        description: t.description || t.name,
        inputSchema: jsonSchema(
          t.inputSchema as Parameters<typeof jsonSchema>[0],
        ),
        execute: async (args) => {
          const result = await mcpClient!.callTool(t.name, args as Record<string, unknown>);
          return result;
        },
      });
    }

    // Add RAG search tool filtered to support docs
    tools['search_documents'] = createSearchDocumentsTool({
      threshold: 0.3,
      topK: 5,
      rerank: true,
      sourceFilter: ['product-docs.md'],
    });

    const convertedMessages = await convertToModelMessages(messages);
    const modelId = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    const result = streamText({
      model: deepseek(modelId),
      system: SUPPORT_SYSTEM_PROMPT,
      messages: convertedMessages,
      tools,
      stopWhen: stepCountIs(5),
      onFinish: async () => {
        // Clean up MCP client when response is done
        if (mcpClient) {
          await mcpClient.disconnect().catch(() => {});
          mcpClient = null;
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err: unknown) {
    // Clean up on error
    if (mcpClient) {
      await mcpClient.disconnect().catch(() => {});
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'error',
          errorText: `Support chat error: ${errorMessage}`,
        });
      },
    });
    return createUIMessageStreamResponse({ stream, status: 500 });
  }
}
