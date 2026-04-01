import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { materializeUniversalSkillFromSuggestion } from "./universal-skill-creator.js";
import type {
  AgencyResult,
  CognitionResult,
  ExecutionContext,
  SkillSuggestion,
} from "../core/types.js";

export type SkillSuggestionFilterPolicy = {
  lockedCapability?: string;
  lockedSkillFile?: string;
  maxSuggestions?: number;
};

export type PreparedSkillSuggestionSet = {
  suggestions: SkillSuggestion[];
  droppedCount: number;
  lockedToCandidateId?: string;
};

function normalizeSkillText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSkillText(value: string): string[] {
  return normalizeSkillText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
}

function tokenOverlap(a: string, b: string): number {
  const setA = new Set(tokenizeSkillText(a));
  const setB = new Set(tokenizeSkillText(b));
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap;
}

function normalizeSkillPath(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, "/").replace(/^\.\//, "");
}

function buildCognitionSuggestionContext(cognitionResult: CognitionResult): string {
  const subtaskDescriptions = cognitionResult.subtasks
    .map((subtask) => subtask.description)
    .join(" ");

  return [cognitionResult.plan, cognitionResult.reasoning, subtaskDescriptions]
    .filter(Boolean)
    .join(" ");
}

function scoreSkillSuggestionAgainstContext(
  suggestion: SkillSuggestion,
  contextText: string
): number {
  const normalizedContext = normalizeSkillText(contextText);
  if (!normalizedContext) return 0;

  let score = 0;

  const capability = normalizeSkillText(suggestion.capability);
  if (capability.length > 0 && normalizedContext.includes(capability)) {
    score += Math.min(16, Math.ceil(capability.length / 3));
  }
  const capabilityOverlap = tokenOverlap(capability, normalizedContext);
  if (capabilityOverlap >= 2) {
    score += capabilityOverlap * 3;
  }

  const descriptionOverlap = tokenOverlap(
    suggestion.description,
    normalizedContext
  );
  if (descriptionOverlap >= 3) {
    score += descriptionOverlap;
  }

  for (const pattern of suggestion.triggerPatterns) {
    const normalizedPattern = normalizeSkillText(pattern);
    if (!normalizedPattern) continue;

    if (normalizedContext.includes(normalizedPattern)) {
      score += Math.min(18, Math.ceil(normalizedPattern.length / 3));
    }

    const overlap = tokenOverlap(normalizedPattern, normalizedContext);
    if (overlap >= 2) {
      score += overlap * 2;
    }
  }

  return score;
}

export function derivePromptAnchorFromCognition(
  cognitionResult: CognitionResult
): string {
  const directDescription = cognitionResult.subtasks
    .map((subtask) => subtask.description.trim())
    .find((description) => description.length > 0);
  if (directDescription) {
    return directDescription;
  }

  return cognitionResult.plan.trim();
}

export function filterSkillSuggestionsForCognitionContext(
  suggestions: SkillSuggestion[],
  cognitionResult: CognitionResult,
  policy: SkillSuggestionFilterPolicy = {}
): { suggestions: SkillSuggestion[]; droppedCount: number } {
  if (suggestions.length === 0) {
    return { suggestions, droppedCount: 0 };
  }

  const contextText = buildCognitionSuggestionContext(cognitionResult);
  const scored = suggestions
    .map((suggestion) => ({
      suggestion,
      score: scoreSkillSuggestionAgainstContext(suggestion, contextText),
    }))
    .filter((item) => item.score >= 6);

  let filtered = scored;
  const normalizedLockedCapability = policy.lockedCapability
    ? normalizeSkillText(policy.lockedCapability)
    : "";
  const normalizedLockedSkillFile = policy.lockedSkillFile
    ? normalizeSkillPath(policy.lockedSkillFile)
    : "";

  if (normalizedLockedCapability || normalizedLockedSkillFile) {
    filtered = filtered.filter(({ suggestion }) => {
      const sameCapability =
        normalizedLockedCapability.length > 0 &&
        normalizeSkillText(suggestion.capability) === normalizedLockedCapability;
      const sameSkillFile =
        normalizedLockedSkillFile.length > 0 &&
        normalizeSkillPath(suggestion.suggestedSkillFile) ===
          normalizedLockedSkillFile;
      return sameCapability || sameSkillFile;
    });
  }

  filtered.sort((a, b) => b.score - a.score);
  const maxSuggestions =
    typeof policy.maxSuggestions === "number" && policy.maxSuggestions > 0
      ? policy.maxSuggestions
      : filtered.length;
  const accepted = filtered.slice(0, maxSuggestions).map((item) => item.suggestion);

  return {
    suggestions: accepted,
    droppedCount: suggestions.length - accepted.length,
  };
}

export function prepareAutonomousSkillSuggestionsForPersistence(
  suggestions: SkillSuggestion[],
  cognitionResult: CognitionResult,
  requestContextOrOptions?:
    | ExecutionContext["requestContext"]
    | { maxSuggestions?: number },
  options: { maxSuggestions?: number } = {}
): PreparedSkillSuggestionSet {
  if (suggestions.length === 0) {
    return { suggestions: [], droppedCount: 0 };
  }

  const requestContext =
    requestContextOrOptions &&
    typeof requestContextOrOptions === "object" &&
    "audience" in requestContextOrOptions
      ? requestContextOrOptions
      : undefined;
  const resolvedOptions =
    requestContextOrOptions &&
    typeof requestContextOrOptions === "object" &&
    !("audience" in requestContextOrOptions)
      ? requestContextOrOptions
      : options;

  const promptAnchor = derivePromptAnchorFromCognition(cognitionResult);
  const matchedCandidate = promptAnchor
    ? skillCandidatesStore.findBestMatchByPrompt(promptAnchor, requestContext)
    : null;
  const matchedMaterializedCandidate =
    matchedCandidate &&
    skillCandidatesStore.isMaterialized(matchedCandidate.suggestedSkillFile)
      ? matchedCandidate
      : null;

  const filtered = filterSkillSuggestionsForCognitionContext(
    suggestions,
    cognitionResult,
    {
      lockedCapability: matchedMaterializedCandidate?.capability,
      lockedSkillFile: matchedMaterializedCandidate?.suggestedSkillFile,
      maxSuggestions: resolvedOptions.maxSuggestions ?? 1,
    }
  );

  return {
    ...filtered,
    lockedToCandidateId: matchedMaterializedCandidate?.id,
  };
}

export async function persistAndMaterializeSkillSuggestions(
  suggestions: SkillSuggestion[],
  context: ExecutionContext
): Promise<{
  materializations: NonNullable<AgencyResult["skillMaterializations"]>;
  issues: string[];
}> {
  const materializations: NonNullable<AgencyResult["skillMaterializations"]> = [];
  const issues: string[] = [];

  for (const suggestion of suggestions) {
    const materialization = materializeUniversalSkillFromSuggestion(
      {
        capability: suggestion.capability,
        description: suggestion.description,
        suggestedSkillFile: suggestion.suggestedSkillFile,
        triggerPatterns: suggestion.triggerPatterns,
      },
      context,
      "autonomous"
    );

    const persisted = await skillCandidatesStore.upsertCandidate({
      capability: suggestion.capability,
      description: suggestion.description,
      audience: context.requestContext.audience,
      scope: context.requestContext.scope,
      brandId: context.requestContext.brandId,
      suggestedSkillFile: materialization.skillFile,
      triggerPatterns: suggestion.triggerPatterns,
      confidence: suggestion.confidence,
      requiresApproval: false,
      source: "autonomous",
    });

    materializations.push({
      candidateId: persisted.id,
      capability: suggestion.capability,
      skillFile: materialization.skillFile,
      action: materialization.action,
      success: materialization.success,
      reason: materialization.reason,
    });

    if (!materialization.success) {
      issues.push(
        `Autonomous skill materialization failed for ${suggestion.capability}: ${
          materialization.reason ?? "unknown error"
        }`
      );
    }
  }

  return { materializations, issues };
}
