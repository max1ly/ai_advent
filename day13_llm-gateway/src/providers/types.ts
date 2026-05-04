export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompleteResult = {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
};

export type ProviderErrorKind = "network" | "auth" | "rate_limit" | "other";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: ProviderErrorKind,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface Provider {
  complete(
    messages: Message[],
    opts?: { model?: string }
  ): Promise<CompleteResult>;
}
