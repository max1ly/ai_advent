import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';

export async function POST(req: Request) {
  const body = await req.json();
  const { serverId, toolName, args, callId } = body;

  if (!toolName || !callId) {
    return NextResponse.json(
      { error: 'Missing required fields: toolName, callId' },
      { status: 400 },
    );
  }

  try {
    // If serverId provided, use it directly. Otherwise resolve by tool name.
    const result = serverId
      ? await mcpManager.callTool(serverId, toolName, args ?? {})
      : await mcpManager.callToolByName(toolName, args ?? {});
    return NextResponse.json({ callId, result, isError: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { callId, error: message, isError: true },
      { status: 500 },
    );
  }
}
