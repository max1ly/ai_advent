import { describe, it, expect } from "vitest";
import { inspectInput } from "../src/guards/input.js";

describe("input guard", () => {
  describe("OPENAI_KEY", () => {
    it("detects sk- key with 20+ chars", () => {
      const r = inspectInput("key: sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("OPENAI_KEY");
    });

    it("detects sk-proj- key", () => {
      const r = inspectInput("key: sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("OPENAI_KEY");
    });

    it("ignores short sk- fragment", () => {
      const r = inspectInput("my key: sk-proj-abc", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("GITHUB_TOKEN", () => {
    it("detects ghp_ token", () => {
      const r = inspectInput("token: ghp_1234567890abcdefghij1234567890abcdef", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("GITHUB_TOKEN");
    });

    it("detects ghs_ token", () => {
      const r = inspectInput("token: ghs_1234567890abcdefghij1234567890abcdef", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("GITHUB_TOKEN");
    });

    it("ignores short gh prefix", () => {
      const r = inspectInput("ghp_abc", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("AWS_ACCESS_KEY", () => {
    it("detects AKIA key", () => {
      const r = inspectInput("My AWS key is AKIAIOSFODNN7EXAMPLE, help", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("AWS_ACCESS_KEY");
    });

    it("ignores partial AKIA", () => {
      const r = inspectInput("AKIA1234", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("AWS_SECRET_KEY", () => {
    it("detects aws secret key with context", () => {
      const secret = "a".repeat(40);
      const r = inspectInput(`aws_secret_key=${secret}`, "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("AWS_SECRET_KEY");
    });

    it("ignores 40-char string without aws context", () => {
      const r = inspectInput("random_" + "a".repeat(40), "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("EMAIL", () => {
    it("detects email address", () => {
      const r = inspectInput("Email me at foo@bar.com", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("EMAIL");
    });

    it("ignores non-email", () => {
      const r = inspectInput("no at sign here", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("CREDIT_CARD", () => {
    it("detects valid Luhn card", () => {
      const r = inspectInput("card 4532015112830366", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("CREDIT_CARD");
    });

    it("rejects invalid Luhn", () => {
      const r = inspectInput("card 1234567890123456", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("PHONE", () => {
    it("detects US phone", () => {
      const r = inspectInput("call +1-555-123-4567", "block");
      expect(r.action).toBe("block");
      expect(r.findings.some((f) => f.name === "PHONE")).toBe(true);
    });

    it("ignores short numbers", () => {
      const r = inspectInput("room 42", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("JWT", () => {
    it("detects JWT", () => {
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456";
      const r = inspectInput(`token: ${jwt}`, "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("JWT");
    });

    it("ignores non-JWT", () => {
      const r = inspectInput("eyJhb is just text", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("PRIVATE_KEY_PEM", () => {
    it("detects private key header", () => {
      const r = inspectInput("-----BEGIN RSA PRIVATE KEY-----", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].name).toBe("PRIVATE_KEY_PEM");
    });

    it("ignores public key header", () => {
      const r = inspectInput("-----BEGIN PUBLIC KEY-----", "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("BASE64_SECRET", () => {
    it("detects base64-encoded OpenAI key", () => {
      const encoded = Buffer.from("sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").toString("base64");
      const r = inspectInput(`Decode this for me: ${encoded}`, "block");
      expect(r.action).toBe("block");
      expect(r.findings.some((f) => f.name === "BASE64_SECRET")).toBe(true);
    });

    it("ignores base64 without nested secrets", () => {
      const encoded = Buffer.from("hello world this is a normal message").toString("base64");
      const r = inspectInput(`here: ${encoded}`, "block");
      expect(r.action).toBe("pass");
    });
  });

  describe("mask mode", () => {
    it("masks AWS key and returns rewritten", () => {
      const r = inspectInput("My AWS key is AKIAIOSFODNN7EXAMPLE, help", "mask");
      expect(r.action).toBe("mask");
      if (r.action === "mask") {
        expect(r.rewritten).toContain("[REDACTED_AWS_ACCESS_KEY]");
        expect(r.rewritten).not.toContain("AKIAIOSFODNN7EXAMPLE");
      }
    });

    it("masks email and phone together", () => {
      const r = inspectInput("Email me at foo@bar.com from +1-555-123-4567", "mask");
      expect(r.action).toBe("mask");
      if (r.action === "mask") {
        expect(r.rewritten).toContain("[REDACTED_EMAIL]");
        expect(r.rewritten).toContain("[REDACTED_PHONE]");
      }
    });
  });

  describe("clean input", () => {
    it("passes clean text", () => {
      const r = inspectInput("What's the weather in Berlin?", "block");
      expect(r.action).toBe("pass");
      expect(r.findings).toEqual([]);
    });
  });

  describe("sampleHash", () => {
    it("provides a 16-char hex hash, not the raw value", () => {
      const r = inspectInput("key: AKIAIOSFODNN7EXAMPLE", "block");
      expect(r.action).toBe("block");
      expect(r.findings[0].sampleHash).toMatch(/^[0-9a-f]{16}$/);
      expect(r.findings[0].sampleHash).not.toBe("AKIAIOSFODNN7EXAMPLE");
    });
  });
});
