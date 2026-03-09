type JsonRecord = Record<string, unknown>;

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractFencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    blocks.push(match[1]?.trim() ?? "");
  }
  return blocks.filter(Boolean);
}

function extractJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  const starts = ["{", "["];
  for (const opening of starts) {
    let from = text.indexOf(opening);
    while (from >= 0) {
      const candidate = text.slice(from).trim();
      candidates.push(candidate);
      from = text.indexOf(opening, from + 1);
    }
  }
  return candidates;
}

/**
 * Parses agent output that may be plain JSON, fenced JSON, or text with embedded JSON.
 */
export function parseAgentJson<T extends JsonRecord = JsonRecord>(
  output: unknown
): T | null {
  if (typeof output !== "string") return null;

  const raw = output.trim();
  if (!raw) return null;

  const direct = tryParseJson(raw);
  if (direct && typeof direct === "object") return direct as T;

  const fencedBlocks = extractFencedBlocks(raw);
  for (const block of fencedBlocks) {
    const parsed = tryParseJson(block);
    if (parsed && typeof parsed === "object") return parsed as T;
  }

  const candidates = extractJsonObjectCandidates(raw);
  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === "object") return parsed as T;
  }

  return null;
}
