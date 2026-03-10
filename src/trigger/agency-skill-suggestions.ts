import { z } from "zod";
import type { SkillSuggestion } from "../core/types.js";

const SkillSuggestionSchema = z.object({
  capability: z.string().min(1),
  description: z.string().min(1),
  suggestedSkillFile: z.string().min(1),
  triggerPatterns: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  requiresApproval: z.boolean().optional().default(true),
  sourceSubtaskId: z.string().optional(),
});

export const SkillSuggestionsArraySchema = z
  .array(SkillSuggestionSchema)
  .default([]);

function normalizePatterns(patterns: string[]): string[] {
  return [...new Set(patterns.map((p) => p.trim()).filter(Boolean))].slice(
    0,
    20
  );
}

function normalizeSkillSuggestion(
  raw: z.infer<typeof SkillSuggestionSchema>
): SkillSuggestion {
  return {
    capability: raw.capability.trim(),
    description: raw.description.trim(),
    suggestedSkillFile: raw.suggestedSkillFile.trim(),
    triggerPatterns: normalizePatterns(raw.triggerPatterns),
    confidence: raw.confidence,
    requiresApproval: raw.requiresApproval,
    sourceSubtaskId: raw.sourceSubtaskId,
  };
}

export function parseAgencySkillSuggestions(payload: unknown): {
  suggestions: SkillSuggestion[];
  issue?: string;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { suggestions: [] };
  }

  const rawSuggestions = (payload as { skillSuggestions?: unknown })
    .skillSuggestions;
  if (typeof rawSuggestions === "undefined") {
    return { suggestions: [] };
  }

  const parsed = SkillSuggestionsArraySchema.safeParse(rawSuggestions);
  if (!parsed.success) {
    return {
      suggestions: [],
      issue:
        "Agency emitted invalid skillSuggestions format; ignored malformed entries.",
    };
  }

  const suggestions = parsed.data.map(normalizeSkillSuggestion);
  return { suggestions };
}
