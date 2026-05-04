import {
  ProviderError,
  type Provider,
  type Message,
  type CompleteResult,
} from "./types.js";

export class DeepSeekProvider implements Provider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.deepseek.com";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(
    messages: Message[],
    opts?: { model?: string }
  ): Promise<CompleteResult> {
    const model = opts?.model ?? "deepseek-chat";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, messages }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError("Request timed out", "network");
      }
      throw new ProviderError("Network error", "network");
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const kind =
        res.status === 401
          ? "auth"
          : res.status === 429
            ? "rate_limit"
            : "other";
      throw new ProviderError(
        `DeepSeek API returned ${res.status}`,
        kind,
        res.status
      );
    }

    const body = await res.json();
    const text = body.choices?.[0]?.message?.content ?? "";
    const usage = body.usage ?? {};

    return {
      text,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
      },
    };
  }
}
