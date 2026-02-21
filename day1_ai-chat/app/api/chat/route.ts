import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import { deepseek } from '@/lib/deepseek';
import { openrouter } from '@/lib/openrouter';
import { MODELS } from '@/lib/models';

export async function POST(req: Request) {
  const { messages, model: requestedModel } = await req.json();

  // Find model config, fallback to deepseek-chat
  const modelConfig = MODELS.find((m) => m.id === requestedModel) ?? MODELS[1];
  const modelId = modelConfig.id;

  const systemPrompt =
    'You must ALWAYS respond in English. Never use Chinese. If input is English, output must be English only.';
  const convertedMessages = await convertToModelMessages(messages);

  // Select provider based on model config
  const modelInstance =
    modelConfig.provider === 'openrouter'
      ? openrouter(modelId)
      : deepseek(modelId);

  // Count messages by role for logging
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
  Model:          ${modelId} (${modelConfig.tier})
  Provider:       ${modelConfig.provider}
  System prompt:  ${systemPrompt.length > 50 ? systemPrompt.slice(0, 50) + '...' : systemPrompt}
  Messages:       ${messages.length} (${roleBreakdown})
────────────────────────────────────`);

  const startTime = Date.now();

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const result = streamText({
        model: modelInstance,
        system: systemPrompt,
        messages: convertedMessages,
        onFinish({ usage }) {
          const elapsed = Date.now() - startTime;
          const inputTokens = usage?.inputTokens ?? 0;
          const outputTokens = usage?.outputTokens ?? 0;
          const totalTokens = inputTokens + outputTokens;
          const cost =
            (inputTokens / 1_000_000) * modelConfig.pricing.input +
            (outputTokens / 1_000_000) * modelConfig.pricing.output;

          console.log(`\x1b[32m[Chat API]\x1b[0m Response complete:
  Time:     ${elapsed}ms
  Tokens:   ${totalTokens} (${inputTokens} in + ${outputTokens} out)
  Cost:     $${cost.toFixed(6)}`);

          writer.write({
            type: 'data-metrics',
            data: {
              responseTime: elapsed,
              inputTokens,
              outputTokens,
              totalTokens,
              cost,
              model: modelId,
              tier: modelConfig.tier,
            },
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
