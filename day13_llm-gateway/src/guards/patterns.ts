export type Pattern = {
  name: string;
  regex: RegExp;
  replacement: string;
  severity: "high" | "medium";
  validator?: (m: string) => boolean;
};

function luhn(num: string): boolean {
  const digits = num.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export const PATTERNS: Pattern[] = [
  {
    name: "OPENAI_KEY",
    regex: /sk-(proj-)?[A-Za-z0-9_-]{20,}/g,
    replacement: "[REDACTED_OPENAI_KEY]",
    severity: "high",
  },
  {
    name: "GITHUB_TOKEN",
    regex: /gh[pousr]_[A-Za-z0-9]{36,}/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
    severity: "high",
  },
  {
    name: "AWS_ACCESS_KEY",
    regex: /AKIA[0-9A-Z]{16}/g,
    replacement: "[REDACTED_AWS_ACCESS_KEY]",
    severity: "high",
  },
  {
    name: "AWS_SECRET_KEY",
    regex: /(?<=aws[_-]?secret[^A-Za-z0-9]{0,5})[A-Za-z0-9/+=]{40}/gi,
    replacement: "[REDACTED_AWS_SECRET_KEY]",
    severity: "high",
  },
  {
    name: "PRIVATE_KEY_PEM",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
    severity: "high",
  },
  {
    name: "JWT",
    regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "[REDACTED_JWT]",
    severity: "high",
  },
  {
    name: "CREDIT_CARD",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[REDACTED_CREDIT_CARD]",
    severity: "high",
    validator: luhn,
  },
  {
    name: "EMAIL",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[REDACTED_EMAIL]",
    severity: "medium",
  },
  {
    name: "PHONE",
    regex: /(?:\+\d{1,3}[-.\s]?)(?:\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}\b|\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
    severity: "medium",
  },
  {
    name: "BASE64_SECRET",
    regex: /[A-Za-z0-9+/]{32,}={0,2}/g,
    replacement: "[REDACTED_BASE64_SECRET]",
    severity: "high",
  },
];
