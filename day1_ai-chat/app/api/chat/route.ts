import { createUIMessageStreamResponse } from 'ai';
import { getOrCreateAgent } from '@/lib/sessions';

export async function POST(req: Request) {
  const { message, sessionId, model } = await req.json();

  const { agent, sessionId: sid } = getOrCreateAgent(sessionId, model);
  const stream = agent.chat(message);

  return createUIMessageStreamResponse({
    stream,
    headers: { 'x-session-id': sid },
  });
}
