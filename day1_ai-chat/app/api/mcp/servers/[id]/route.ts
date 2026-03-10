import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';
import { getMcpServer, updateMcpServer, deleteMcpServer } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  const body = await req.json();
  const updates: { name?: string; transport?: string; config?: string; enabled?: number } = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.transport !== undefined) updates.transport = body.transport;
  if (body.config !== undefined) updates.config = JSON.stringify(body.config);
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;

  updateMcpServer(id, updates);

  // If disabling, disconnect the server
  if (body.enabled === false) {
    await mcpManager.disconnect(id);
  }

  const statuses = mcpManager.getServerStatuses();
  const status = statuses.find((s) => s.id === id);

  return NextResponse.json({ server: status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await mcpManager.disconnect(id);
  deleteMcpServer(id);

  return NextResponse.json({ success: true });
}
