import { getSessionMessages } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const messages = getSessionMessages(sessionId);

  return Response.json({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
}
