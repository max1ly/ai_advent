import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export type AuditEvent = {
  ts: string;
  requestId: string;
  ip: string;
  durationMs?: number;
  event: "request" | "rate_limit" | "validation_error" | "provider_error";
  mode?: "block" | "mask";
  inputAction?: "pass" | "block" | "mask";
  outputAction?: "pass" | "block" | "redact";
  inputFindings?: Array<{ name: string; count: number; sampleHash: string }>;
  outputFlags?: Array<{ name: string; count: number }>;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  promptHash?: string;
  maskedPrompt?: string;
  responseHash?: string;
  blockedReason?: string;
};

let currentDate = "";
let currentPath = "";

export function audit(event: AuditEvent, logDir: string): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDate) {
    currentDate = today;
    currentPath = join(logDir, `requests-${today}.jsonl`);
  }

  appendFileSync(currentPath, JSON.stringify(event) + "\n");
}
