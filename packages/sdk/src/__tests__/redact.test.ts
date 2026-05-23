import { describe, expect, it } from "vitest";
import { mergeSummaries, redact, redactPreview } from "../redact.ts";

describe("redact", () => {
  it("redacts email addresses", () => {
    const { text, summary } = redact("Contact me at user@example.com for details.");
    expect(text).toBe("Contact me at [EMAIL] for details.");
    expect(summary["email"]).toBe(1);
  });

  it("redacts phone numbers", () => {
    const { text, summary } = redact("Call 555-867-5309 or (800) 555-1234.");
    expect(text).toContain("[PHONE]");
    expect(summary["phone"]).toBeGreaterThan(0);
  });

  it("redacts SSNs", () => {
    const { text, summary } = redact("SSN: 123-45-6789");
    expect(text).toBe("SSN: [SSN]");
    expect(summary["ssn"]).toBe(1);
  });

  it("redacts credit card numbers", () => {
    const { text, summary } = redact("Card: 4111 1111 1111 1111");
    expect(text).toBe("Card: [CREDIT_CARD]");
    expect(summary["credit_card"]).toBe(1);
  });

  it("redacts IP addresses", () => {
    const { text, summary } = redact("Server at 192.168.1.100");
    expect(text).toBe("Server at [IP]");
    expect(summary["ip_address"]).toBe(1);
  });

  it("returns empty summary for clean text", () => {
    const { text, summary } = redact("Hello, how are you?");
    expect(text).toBe("Hello, how are you?");
    expect(Object.keys(summary)).toHaveLength(0);
  });

  it("handles multiple PII types in one string", () => {
    const { text, summary } = redact("Email: test@test.com, SSN: 123-45-6789");
    expect(text).toBe("Email: [EMAIL], SSN: [SSN]");
    expect(summary["email"]).toBe(1);
    expect(summary["ssn"]).toBe(1);
  });
});

describe("redactPreview", () => {
  it("truncates long text", () => {
    const long = "a".repeat(500);
    const { text } = redactPreview(long, 100);
    expect(text.length).toBeLessThanOrEqual(104); // 100 + "…"
    expect(text.endsWith("…")).toBe(true);
  });

  it("does not truncate short text", () => {
    const { text } = redactPreview("short text", 300);
    expect(text).toBe("short text");
  });
});

describe("mergeSummaries", () => {
  it("merges two summaries by summing counts", () => {
    const a = { email: 1, phone: 2 };
    const b = { email: 1, ssn: 3 };
    expect(mergeSummaries(a, b)).toEqual({ email: 2, phone: 2, ssn: 3 });
  });

  it("handles empty summaries", () => {
    expect(mergeSummaries({}, { email: 1 })).toEqual({ email: 1 });
    expect(mergeSummaries({ email: 1 }, {})).toEqual({ email: 1 });
  });
});
