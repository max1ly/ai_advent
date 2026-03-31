import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';
import type { StrategyType } from '@/lib/types';

export async function POST(req: Request) {
  const { message, sessionId, model, files, strategy, windowSize, profileId, invariants, forceToolUse, ragEnabled, ragThreshold, ragTopK, ragRerank, ragSourceFilter, devAssistant } = await req.json();

  const strategySettings = {
    type: (strategy as StrategyType) ?? 'sliding-window',
    windowSize: windowSize ?? 10,
  };

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model, strategySettings);

  try {
    const stream = agent.chat(message, files, {
      profileId: profileId ? Number(profileId) : undefined,
      invariants: invariants as string[] | undefined,
      forceToolUse: forceToolUse as boolean | undefined,
      ragEnabled: ragEnabled as boolean | undefined,
      ragThreshold: ragThreshold as number | undefined,
      ragTopK: ragTopK as number | undefined,
      ragRerank: ragRerank as boolean | undefined,
      ragSourceFilter: ragSourceFilter as string[] | undefined,
      devAssistant: devAssistant as boolean | undefined,
    });
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
