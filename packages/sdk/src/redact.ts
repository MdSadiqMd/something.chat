export interface RedactionResult {
  text: string;
  summary: Record<string, number>;
}

const PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp; replacement: string }> = [
  {
    name: "email",
    pattern: /[\w.+-]+@[\w-]+\.[\w.]+/gi,
    replacement: "[EMAIL]",
  },
  {
    name: "phone",
    pattern: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE]",
  },
  {
    name: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[SSN]",
  },
  {
    name: "credit_card",
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[CREDIT_CARD]",
  },
  {
    name: "ip_address",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[IP]",
  },
];

export function redact(text: string): RedactionResult {
  const summary: Record<string, number> = {};
  let result = text;

  for (const { name, pattern, replacement } of PATTERNS) {
    // Reset lastIndex for global patterns used across calls
    pattern.lastIndex = 0;
    const matches = result.match(pattern);
    if (matches && matches.length > 0) {
      summary[name] = matches.length;
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
    }
  }

  return { text: result, summary };
}

export function redactPreview(text: string, maxLength = 300): RedactionResult {
  const { text: redacted, summary } = redact(text);
  const truncated =
    redacted.length > maxLength ? redacted.slice(0, maxLength) + "…" : redacted;
  return { text: truncated, summary };
}

export function mergeSummaries(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    result[k] = (result[k] ?? 0) + v;
  }
  return result;
}
