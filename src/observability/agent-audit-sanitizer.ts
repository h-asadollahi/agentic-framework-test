const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|api[_-]?key|client[_-]?secret|password|bearer)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._\-]+|xox[baprs]-[a-z0-9-]+|sk-[a-z0-9-]{12,}|eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+)/i;

const DEFAULT_MAX_STRING_LENGTH = 4000;
const DEFAULT_MAX_ARRAY_ITEMS = 50;
const DEFAULT_MAX_OBJECT_KEYS = 50;

export interface AuditSanitizeOptions {
  maxStringLength?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateText(text: string, maxLength: number): string | Record<string, unknown> {
  if (text.length <= maxLength) return text;
  return {
    type: "text-preview",
    truncated: true,
    originalLength: text.length,
    preview: `${text.slice(0, maxLength)}…`,
  };
}

function sanitizeString(value: string, keyName: string | null, maxLength: number): unknown {
  if ((keyName && SENSITIVE_KEY_PATTERN.test(keyName)) || SENSITIVE_VALUE_PATTERN.test(value)) {
    return "[REDACTED]";
  }
  return truncateText(value, maxLength);
}

function sanitizeArray(value: unknown[], options: Required<AuditSanitizeOptions>): unknown[] {
  const items = value.slice(0, options.maxArrayItems).map((entry) =>
    sanitizeAuditPayload(entry, options)
  );

  if (value.length > options.maxArrayItems) {
    items.push({
      type: "array-truncated",
      truncated: true,
      originalLength: value.length,
      omittedItems: value.length - options.maxArrayItems,
    });
  }

  return items;
}

function sanitizeObject(
  value: Record<string, unknown>,
  options: Required<AuditSanitizeOptions>
): Record<string, unknown> {
  const entries = Object.entries(value);
  const limitedEntries = entries.slice(0, options.maxObjectKeys);
  const sanitized = Object.fromEntries(
    limitedEntries.map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, sanitizeAuditPayload(entryValue, options, key)];
    })
  );

  if (entries.length > options.maxObjectKeys) {
    sanitized.__truncatedKeys = {
      truncated: true,
      originalLength: entries.length,
      omittedKeys: entries.length - options.maxObjectKeys,
    };
  }

  return sanitized;
}

export function sanitizeAuditPayload(
  value: unknown,
  options: AuditSanitizeOptions = {},
  keyName: string | null = null
): unknown {
  const normalizedOptions: Required<AuditSanitizeOptions> = {
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS,
  };

  if (value == null) return value;
  if (typeof value === "string") {
    return sanitizeString(value, keyName, normalizedOptions.maxStringLength);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return sanitizeArray(value, normalizedOptions);
  if (isPlainObject(value)) return sanitizeObject(value, normalizedOptions);
  return String(value);
}
