import { createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import { NextResponse } from 'next/server';
import { getOrCreateAgent } from '@/lib/sessions';
import type { StrategyType } from '@/lib/types';

export async function POST(req: Request) {
  const { message, sessionId, model, files, strategy, windowSize, profileId, invariants, forceToolUse, ragEnabled, ragThreshold, ragTopK, ragRerank, ragSourceFilter, diffReview } = await req.json();

  if (ragThreshold !== undefined && ragThreshold !== null) {
    const threshold = Number(ragThreshold);
    if (Number.isNaN(threshold)) {
      return NextResponse.json(
        { error: 'ragThreshold must be a valid number' },
        { status: 400 },
      );
    }
    if (threshold < 0) {
      return NextResponse.json(
        { error: 'ragThreshold must not be negative' },
        { status: 400 },
      );
    }
    if (threshold > 1) {
      return NextResponse.json(
        { error: 'ragThreshold must not exceed 1' },
        { status: 400 },
      );
    }
  }

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
      diffReview: diffReview as boolean | undefined,
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
