import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';
import type { StrategyType } from '@/lib/types';

export async function POST(req: Request) {
  const { message, sessionId, model, files, strategy, windowSize } = await req.json();

  const strategySettings = {
    type: (strategy as StrategyType) ?? 'sliding-window',
    windowSize: windowSize ?? 10,
  };

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model, strategySettings);

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
