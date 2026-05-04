import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { inspectInput } from "../guards/input.js";
import { inspectOutput } from "../guards/output.js";
import { audit } from "../audit/logger.js";
import { estimate } from "../cost/estimator.js";
import type { Provider } from "../providers/types.js";
import { ProviderError } from "../providers/types.js";

const bodySchema = z.object({
  prompt: z.string().min(1).max(8000),
  mode: z.enum(["block", "mask"]).optional(),
});

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function createChatRouter(provider: Provider): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const requestId = (req as any).id as string;
    const ip = req.ip ?? "unknown";
    const start = Date.now();

    const parseResult = bodySchema.safeParse(req.body);
    if (!parseResult.success) {
      audit(
        {
          ts: new Date().toISOString(),
          requestId,
          ip,
          event: "validation_error",
          durationMs: Date.now() - start,
        },
        config.logDir
      );
      res.status(400).json({
        requestId,
        error: "Invalid request body",
        code: "validation_error",
      });
      return;
    }

    const { prompt, mode: requestMode } = parseResult.data;
    const mode = requestMode ?? config.guardMode;

    const inputResult = inspectInput(prompt, mode);

    if (inputResult.action === "block") {
      audit(
        {
          ts: new Date().toISOString(),
          requestId,
          ip,
          event: "request",
          mode,
          inputAction: "block",
          inputFindings: inputResult.findings,
          promptHash: hashText(prompt),
          blockedReason: "input_secret_detected",
          durationMs: Date.now() - start,
        },
        config.logDir
      );
      res.status(400).json({
        requestId,
        blocked: true,
        reason: "input_secret_detected",
        findings: inputResult.findings,
      });
      return;
    }

    const effectivePrompt =
      inputResult.action === "mask" ? inputResult.rewritten : prompt;
    const inputRedactions =
      inputResult.action === "mask"
        ? inputResult.findings.map((f) => f.name)
        : [];

    let text: string;
    let usage: { promptTokens: number; completionTokens: number };

    try {
      const result = await provider.complete(
        [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: effectivePrompt },
        ],
        { model: config.model }
      );
      text = result.text;
      usage = result.usage;
    } catch (err) {
      const errMsg =
        err instanceof ProviderError
          ? err.kind === "auth" || err.kind === "other"
            ? "upstream_rejected"
            : "upstream_unavailable"
          : "upstream_unavailable";

      audit(
        {
          ts: new Date().toISOString(),
          requestId,
          ip,
          event: "provider_error",
          mode,
          inputAction: inputResult.action,
          promptHash: hashText(prompt),
          ...(inputResult.action === "mask"
            ? { maskedPrompt: inputResult.rewritten }
            : {}),
          blockedReason: errMsg,
          durationMs: Date.now() - start,
        },
        config.logDir
      );
      res.status(502).json({ requestId, error: errMsg });
      return;
    }

    const outputResult = inspectOutput(text, {
      canary: config.canary,
      systemPrompt: config.systemPrompt,
      urlAllowlist: config.urlAllowlist,
    });

    if (outputResult.action === "block") {
      audit(
        {
          ts: new Date().toISOString(),
          requestId,
          ip,
          event: "request",
          mode,
          inputAction: inputResult.action,
          outputAction: "block",
          inputFindings:
            inputResult.action !== "pass" ? inputResult.findings : undefined,
          outputFlags: outputResult.flags.map((f) => ({
            name: f.name,
            count: f.count,
          })),
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          promptHash: hashText(prompt),
          ...(inputResult.action === "mask"
            ? { maskedPrompt: inputResult.rewritten }
            : {}),
          responseHash: hashText(text),
          blockedReason: "output_secret_or_canary",
          durationMs: Date.now() - start,
        },
        config.logDir
      );
      res.status(502).json({
        requestId,
        blocked: true,
        reason: "output_secret_or_canary",
        flags: outputResult.flags,
      });
      return;
    }

    if (outputResult.action === "redact") {
      audit(
        {
          ts: new Date().toISOString(),
          requestId,
          ip,
          event: "request",
          mode,
          inputAction: inputResult.action,
          outputAction: "pass",
          durationMs: Date.now() - start,
        },
        config.logDir
      );
    }

    const cost = estimate({
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      model: config.model,
    });

    const outputRedactions = outputResult.flags
      .filter(
        (f): f is { name: string; count: number; sampleHash: string } =>
          "sampleHash" in f
      )
      .map((f) => f.name);
    const flagNames = outputResult.flags.map((f) => f.name);

    audit(
      {
        ts: new Date().toISOString(),
        requestId,
        ip,
        event: "request",
        mode,
        inputAction: inputResult.action,
        outputAction: outputResult.action,
        inputFindings:
          inputResult.action !== "pass" ? inputResult.findings : undefined,
        outputFlags:
          outputResult.flags.length > 0
            ? outputResult.flags.map((f) => ({ name: f.name, count: f.count }))
            : undefined,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: cost.costUsd,
        promptHash: hashText(prompt),
        ...(inputResult.action === "mask"
          ? { maskedPrompt: inputResult.rewritten }
          : {}),
        responseHash: hashText(text),
        durationMs: Date.now() - start,
      },
      config.logDir
    );

    res.status(200).json({
      requestId,
      reply: text,
      blocked: false,
      redactions: { input: inputRedactions, output: outputRedactions },
      flags: flagNames,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costUsd: cost.costUsd,
      },
    });
  });

  return router;
}
