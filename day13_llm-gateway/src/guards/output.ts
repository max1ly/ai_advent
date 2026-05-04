import { createHash } from "node:crypto";
import { PATTERNS } from "./patterns.js";
import type { Finding } from "./input.js";

export type OutputFlag =
  | { name: "canary_leak"; count: number }
  | { name: "system_prompt_echo"; count: number }
  | { name: "suspicious_url"; count: number; samples: string[] }
  | { name: "shell_command_block"; count: number }
  | Finding;

export type OutputResult =
  | { action: "pass"; flags: OutputFlag[] }
  | { action: "block"; flags: OutputFlag[] }
  | { action: "redact"; flags: OutputFlag[]; rewritten: string };

function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function inspectOutput(
  text: string,
  ctx: { canary: string; systemPrompt: string; urlAllowlist: string[] }
): OutputResult {
  const flags: OutputFlag[] = [];
  let mustBlock = false;

  if (text.includes(ctx.canary)) {
    flags.push({ name: "canary_leak", count: 1 });
    mustBlock = true;
  }

  const promptPrefix = ctx.systemPrompt.slice(0, 80);
  if (text.includes(promptPrefix)) {
    flags.push({ name: "system_prompt_echo", count: 1 });
    mustBlock = true;
  }

  // Catalog secret scan
  for (const pattern of PATTERNS) {
    if (pattern.name === "BASE64_SECRET") continue;
    pattern.regex.lastIndex = 0;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text)) !== null) {
      const val = m[0];
      if (pattern.validator && !pattern.validator(val)) continue;
      matches.push(val);
    }
    if (matches.length > 0) {
      flags.push({
        name: pattern.name,
        count: matches.length,
        sampleHash: hashSecret(matches[0]),
      });
      mustBlock = true;
    }
  }

  // Suspicious URLs
  const urlRegex = /https?:\/\/([a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,}))(\/[^\s)]*)?/g;
  const urlMatches: string[] = [];
  let um: RegExpExecArray | null;
  while ((um = urlRegex.exec(text)) !== null) {
    const hostname = um[1];
    if (!ctx.urlAllowlist.includes(hostname)) {
      urlMatches.push(hostname);
    }
  }
  const hasSuspiciousUrl = urlMatches.length > 0;
  if (hasSuspiciousUrl) {
    flags.push({
      name: "suspicious_url",
      count: urlMatches.length,
      samples: [...new Set(urlMatches)],
    });
  }

  // Shell command blocks
  const shellFenceRegex = /```(?:bash|sh|shell)\b/g;
  const shellLineRegex = /^\s*(?:curl|wget|nc|bash|eval|sh)\s+/gm;
  const fenceCount =
    (text.match(shellFenceRegex) || []).length +
    (text.match(shellLineRegex) || []).length;
  const hasShellBlock = fenceCount > 0;
  if (hasShellBlock) {
    flags.push({ name: "shell_command_block", count: fenceCount });
  }

  if (hasShellBlock && hasSuspiciousUrl) {
    mustBlock = true;
  }

  if (mustBlock) {
    return { action: "block", flags };
  }

  return { action: "pass", flags };
}
