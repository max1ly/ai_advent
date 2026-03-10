import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await mcpManager.disconnect(id);

  return NextResponse.json({ status: 'disconnected' });
}
