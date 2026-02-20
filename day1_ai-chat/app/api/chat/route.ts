import { streamText, convertToModelMessages } from 'ai';
import { deepseek } from '@/lib/deepseek';

export async function POST(req: Request) {
  const { messages, temperature: rawTemperature } = await req.json();

  const modelId = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const systemPrompt = 'You must ALWAYS respond in English. Never use Chinese. If input is English, output must be English only.';
  const parsed = Number(rawTemperature);
  const temperature = Math.min(2, Math.max(0, Number.isFinite(parsed) ? parsed : 1.0));
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
  Temperature:    ${temperature}
  Messages:       ${messages.length} (${roleBreakdown})
────────────────────────────────────`);

  const result = streamText({
    model: deepseek(modelId),
    system: systemPrompt,
    temperature,
    messages: convertedMessages,
  });

  return result.toUIMessageStreamResponse();
}
