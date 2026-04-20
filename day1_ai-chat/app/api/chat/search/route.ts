import { NextResponse } from 'next/server';
import { searchMessages } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const sessionId = url.searchParams.get('sessionId') ?? undefined;

    if (!q || !q.trim()) {
      return NextResponse.json({ results: [] });
    }

    const results = searchMessages(q, sessionId);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
