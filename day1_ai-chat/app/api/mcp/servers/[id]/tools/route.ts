import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const client = mcpManager.getClient(id);
  const tools = client ? client.getTools() : [];

  return NextResponse.json({ tools });
}
