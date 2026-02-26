import { getSessionMessagesWithFiles } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const messages = getSessionMessagesWithFiles(sessionId);

  return Response.json({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      files: m.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        mediaType: f.media_type,
        size: f.size,
      })),
    })),
  });
}
