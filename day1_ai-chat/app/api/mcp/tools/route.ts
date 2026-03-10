import { NextResponse } from 'next/server';
import { mcpManager } from '@/lib/mcp/manager';

export async function GET() {
  const tools = mcpManager.getAllTools();
  return NextResponse.json({ tools });
}
