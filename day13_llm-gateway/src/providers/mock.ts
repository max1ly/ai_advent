import type { Provider, Message, CompleteResult } from "./types.js";

export class MockProvider implements Provider {
  constructor(private script: Map<string, CompleteResult>) {}

  async complete(messages: Message[]): Promise<CompleteResult> {
    const userMsg = messages.find((m) => m.role === "user")!.content;
    return this.script.get(userMsg) ?? this.defaultResponse(userMsg);
  }

  private defaultResponse(userMsg: string): CompleteResult {
    return {
      text: `Mock reply to: ${userMsg.slice(0, 60)}`,
      usage: { promptTokens: 10, completionTokens: 20 },
    };
  }
}
