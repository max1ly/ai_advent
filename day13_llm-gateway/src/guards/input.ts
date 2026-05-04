import { createHash } from "node:crypto";
import { PATTERNS, type Pattern } from "./patterns.js";

export type Finding = { name: string; count: number; sampleHash: string };
export type InputResult =
  | { action: "pass"; findings: [] }
  | { action: "block"; findings: Finding[] }
  | { action: "mask"; findings: Finding[]; rewritten: string };

function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function scanText(
  text: string,
  patterns: Pattern[],
  skipBase64 = false
): { findings: Finding[]; masked: string } {
  const findings: Finding[] = [];
  let masked = text;

  for (const pattern of patterns) {
    if (skipBase64 && pattern.name === "BASE64_SECRET") continue;

    pattern.regex.lastIndex = 0;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text)) !== null) {
      const val = m[0];
      if (pattern.validator && !pattern.validator(val)) continue;
      matches.push(val);
    }

    if (matches.length > 0) {
      findings.push({
        name: pattern.name,
        count: matches.length,
        sampleHash: hashSecret(matches[0]),
      });
      for (const match of matches) {
        masked = masked.replaceAll(match, pattern.replacement);
      }
    }
  }

  return { findings, masked };
}

function scanBase64(text: string): Finding[] {
  const base64Pattern = PATTERNS.find((p) => p.name === "BASE64_SECRET")!;
  base64Pattern.regex.lastIndex = 0;
  const findings: Finding[] = [];

  let m: RegExpExecArray | null;
  while ((m = base64Pattern.regex.exec(text)) !== null) {
    const raw = m[0];
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      const nested = scanText(decoded, PATTERNS, true);
      if (nested.findings.length > 0) {
        findings.push({
          name: "BASE64_SECRET",
          count: 1,
          sampleHash: hashSecret(raw),
        });
      }
    } catch {
      // not valid base64, skip
    }
  }

  return findings;
}

export function inspectInput(
  text: string,
  mode: "block" | "mask"
): InputResult {
  const nonBase64Patterns = PATTERNS.filter((p) => p.name !== "BASE64_SECRET");
  const { findings: directFindings, masked } = scanText(
    text,
    nonBase64Patterns
  );

  const base64Findings = scanBase64(text);
  const allFindings = [...directFindings, ...base64Findings];

  if (allFindings.length === 0) {
    return { action: "pass", findings: [] };
  }

  if (mode === "block") {
    return { action: "block", findings: allFindings };
  }

  // mask mode: apply masking, then re-scan once for overlapping secrets
  let rewritten = masked;
  for (const bf of base64Findings) {
    const base64Pattern = PATTERNS.find((p) => p.name === "BASE64_SECRET")!;
    base64Pattern.regex.lastIndex = 0;
    let bm: RegExpExecArray | null;
    while ((bm = base64Pattern.regex.exec(text)) !== null) {
      try {
        const decoded = Buffer.from(bm[0], "base64").toString("utf-8");
        const nested = scanText(decoded, PATTERNS, true);
        if (nested.findings.length > 0) {
          rewritten = rewritten.replaceAll(
            bm[0],
            base64Pattern.replacement
          );
        }
      } catch {
        // skip
      }
    }
  }

  // re-scan rewritten text once for overlapping/adjacent secrets
  const { findings: rescanFindings, masked: finalRewritten } = scanText(
    rewritten,
    nonBase64Patterns
  );
  for (const f of rescanFindings) {
    const existing = allFindings.find((e) => e.name === f.name);
    if (!existing) {
      allFindings.push(f);
    }
  }

  return { action: "mask", findings: allFindings, rewritten: finalRewritten };
}
