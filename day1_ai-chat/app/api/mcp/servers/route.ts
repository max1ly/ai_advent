import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';
import { createMcpServer } from '@/lib/db';

export async function GET() {
  const servers = mcpManager.getServerStatuses();
  return NextResponse.json({ servers });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, transport, config } = body;

  if (!name || !transport || !config) {
    return NextResponse.json(
      { error: 'Missing required fields: name, transport, config' },
      { status: 400 },
    );
  }

  if (transport !== 'stdio' && transport !== 'sse') {
    return NextResponse.json(
      { error: 'Invalid transport: must be "stdio" or "sse"' },
      { status: 400 },
    );
  }

  const id = createMcpServer(name, transport, JSON.stringify(config));
  const server = { id, name, transport, config, enabled: true };

  return NextResponse.json({ server }, { status: 201 });
}
