import { NextResponse } from 'next/server';
import { getSessionMessagesWithFiles } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId query param is required' }, { status: 400 });
    }

    const messages = getSessionMessagesWithFiles(sessionId);

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found for this session' }, { status: 404 });
    }

    const lines: string[] = [];
    lines.push(`# Chat Export`);
    lines.push(`**Session:** ${sessionId}`);
    lines.push(`**Exported:** ${new Date().toISOString()}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      lines.push(`### ${roleLabel}`);
      lines.push(`*${msg.created_at}*`);
      lines.push('');
      lines.push(msg.content);

      if (msg.files.length > 0) {
        lines.push('');
        lines.push('**Attachments:**');
        for (const file of msg.files) {
          lines.push(`- ${file.filename} (${file.media_type}, ${file.size} bytes)`);
        }
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    const markdown = lines.join('\n');

    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="chat-export-${sessionId.slice(0, 8)}.md"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
