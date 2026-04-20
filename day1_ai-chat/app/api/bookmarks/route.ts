import { NextResponse } from 'next/server';
import { saveBookmark, removeBookmark, getBookmarks } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    const bookmarks = getBookmarks(sessionId);
    return NextResponse.json({ bookmarks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, messageIndex, label } = body;
    if (!sessionId || messageIndex === undefined) {
      return NextResponse.json({ error: 'sessionId and messageIndex are required' }, { status: 400 });
    }
    saveBookmark(sessionId, messageIndex, label ?? 'bookmark');
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, messageIndex } = body;
    if (!sessionId || messageIndex === undefined) {
      return NextResponse.json({ error: 'sessionId and messageIndex are required' }, { status: 400 });
    }
    removeBookmark(sessionId, messageIndex);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
