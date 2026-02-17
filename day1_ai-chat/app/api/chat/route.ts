import { streamText, convertToModelMessages } from 'ai';
import { deepseek } from '@/lib/deepseek';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: deepseek(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'),
    system: 'Always reply in the same language the user writes in.',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
