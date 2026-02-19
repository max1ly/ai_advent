import { streamText, convertToModelMessages } from 'ai';
import { deepseek } from '@/lib/deepseek';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const modelId = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const systemPrompt = 'Always reply in the same language the user writes in.';
  const convertedMessages = await convertToModelMessages(messages);

  // Count messages by role
  const roleCounts = messages.reduce(
    (acc: Record<string, number>, m: { role: string }) => {
      acc[m.role] = (acc[m.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const roleBreakdown = Object.entries(roleCounts)
    .map(([role, count]) => `${count} ${role}`)
    .join(', ');

  console.log(`
\x1b[36m[Chat API]\x1b[0m ─────────────────────────
  Model:          ${modelId}
  System prompt:  ${systemPrompt.length > 50 ? systemPrompt.slice(0, 50) + '...' : systemPrompt}
  Messages:       ${messages.length} (${roleBreakdown})
────────────────────────────────────`);

  const result = streamText({
    model: deepseek(modelId),
    system: systemPrompt,
    messages: convertedMessages,
  });

  return result.toUIMessageStreamResponse();
}
