import { NextResponse } from 'next/server';
import { getSessions } from '@/lib/db';

export async function GET() {
  try {
    const sessions = getSessions();
    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
