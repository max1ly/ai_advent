import { NextResponse } from 'next/server';
import { applyPendingWrite, rejectPendingWrite } from '@/lib/dev-assistant';

export async function POST(req: Request) {
  const { writeId, action } = await req.json();

  if (!writeId || typeof writeId !== 'string') {
    return NextResponse.json({ error: 'Missing writeId' }, { status: 400 });
  }

  if (action === 'reject') {
    const result = rejectPendingWrite(writeId);
    return NextResponse.json(result);
  }

  if (action === 'apply') {
    const result = applyPendingWrite(writeId);
    if ('error' in result) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
