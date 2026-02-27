import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';

export async function POST(req: Request) {
  const { message, sessionId, model, files, compressionEnabled, recentWindowSize, summaryBatchSize } = await req.json();

  const compression = {
    enabled: compressionEnabled ?? false,
    recentWindowSize: recentWindowSize ?? 6,
    summaryBatchSize: summaryBatchSize ?? 10,
  };

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model, compression);

  try {
    const stream = agent.chat(message, files);
    return createUIMessageStreamResponse({
      stream,
      headers: { 'x-session-id': sid },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'error',
          errorText: errorMessage,
        });
      },
    });
    return createUIMessageStreamResponse({
      stream,
      status: 500,
      headers: { 'x-session-id': sid },
    });
  }
}
