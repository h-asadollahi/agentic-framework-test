import { describe, expect, it } from "vitest";
import { sanitizeAuditPayload } from "../../src/observability/agent-audit-sanitizer.js";

describe("sanitizeAuditPayload", () => {
  it("redacts sensitive keys and bearer-like values", () => {
    const sanitized = sanitizeAuditPayload({
      authorization: "Bearer secret-token-value",
      nested: {
        apiKey: "sk-very-secret-value",
        safe: "hello",
      },
    }) as Record<string, unknown>;

    expect(sanitized.authorization).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).safe).toBe("hello");
  });

  it("truncates long strings and oversized arrays with metadata", () => {
    const sanitized = sanitizeAuditPayload(
      {
        prompt: "x".repeat(5000),
        rows: Array.from({ length: 55 }, (_, index) => ({ index })),
      },
      { maxStringLength: 100, maxArrayItems: 3 }
    ) as Record<string, unknown>;

    expect(sanitized.prompt).toEqual(
      expect.objectContaining({
        type: "text-preview",
        truncated: true,
        originalLength: 5000,
      })
    );

    const rows = sanitized.rows as unknown[];
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual(
      expect.objectContaining({
        type: "array-truncated",
        truncated: true,
        originalLength: 55,
        omittedItems: 52,
      })
    );
  });
});
