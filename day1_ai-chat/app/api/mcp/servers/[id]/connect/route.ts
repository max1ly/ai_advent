import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';
import { getMcpServer } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  try {
    const tools = await mcpManager.connect(id);
    return NextResponse.json({ status: 'connected', tools });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
