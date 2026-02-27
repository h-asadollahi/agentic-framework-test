import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  BrandIdentity,
  ExecutionContext,
  GuardrailConstraints,
  ShortTermMemory,
  LongTermMemory,
} from "./types.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

/**
 * Parse soul.md into a BrandIdentity object.
 *
 * Expects a markdown file with H2 sections:
 *   ## Personality, ## Values, ## Voice, ## Target Audience, etc.
 */
export function parseSoulFile(filePath?: string): BrandIdentity {
  const soulPath = filePath ?? resolve(PROJECT_ROOT, "soul.md");
  if (!existsSync(soulPath)) {
    return getDefaultBrandIdentity();
  }

  const raw = readFileSync(soulPath, "utf-8");
  const lines = raw.split("\n");

  let name = "Brand";
  const personality: string[] = [];
  const values: string[] = [];
  const voice = { tone: "", style: "", vocabulary: [] as string[], neverSay: [] as string[] };
  let targetAudience = "";

  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // H1 → brand name
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      name = trimmed.replace(/^#\s+/, "").replace(/^Brand Identity:\s*/i, "");
      continue;
    }

    // H2 → section header
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.replace(/^##\s+/, "").toLowerCase();
      continue;
    }

    // H3 inside voice section
    if (trimmed.startsWith("### ") && currentSection === "voice") {
      const sub = trimmed.replace(/^###\s+/, "");
      const [key, ...rest] = sub.split(":");
      const value = rest.join(":").trim();
      const keyLower = key.toLowerCase();
      if (keyLower.includes("tone")) voice.tone = value;
      else if (keyLower.includes("style")) voice.style = value;
      else if (keyLower.includes("never")) voice.neverSay = parseList(value);
      continue;
    }

    // List items
    if (trimmed.startsWith("- ")) {
      const item = trimmed.replace(/^-\s+/, "");
      if (currentSection === "personality") personality.push(item);
      else if (currentSection === "values") values.push(item);
      else if (currentSection.includes("never")) voice.neverSay.push(item);
      else if (currentSection.includes("vocabulary")) voice.vocabulary.push(item);
    }

    // Plain text under target audience
    if (currentSection === "target audience" && trimmed.length > 0 && !trimmed.startsWith("#")) {
      targetAudience += (targetAudience ? " " : "") + trimmed;
    }
  }

  return {
    name,
    personality,
    values,
    voice,
    targetAudience,
    guidelines: raw,
  };
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/**
 * Parse guardrails.md into GuardrailConstraints.
 */
export function parseGuardrailsFile(filePath?: string): GuardrailConstraints {
  const guardrailPath = filePath ?? resolve(PROJECT_ROOT, "knowledge/guardrails.md");
  if (!existsSync(guardrailPath)) {
    return { neverDo: [], alwaysDo: [], brandVoiceRules: [], contentPolicies: [] };
  }

  const raw = readFileSync(guardrailPath, "utf-8");
  const lines = raw.split("\n");

  const constraints: GuardrailConstraints = {
    neverDo: [],
    alwaysDo: [],
    brandVoiceRules: [],
    contentPolicies: [],
  };

  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.replace(/^##\s+/, "").toLowerCase();
      continue;
    }
    if (trimmed.startsWith("- ")) {
      const item = trimmed.replace(/^-\s+/, "");
      if (currentSection.includes("never")) constraints.neverDo.push(item);
      else if (currentSection.includes("always")) constraints.alwaysDo.push(item);
      else if (currentSection.includes("voice")) constraints.brandVoiceRules.push(item);
      else if (currentSection.includes("content") || currentSection.includes("polic"))
        constraints.contentPolicies.push(item);
    }
  }

  return constraints;
}

function getDefaultBrandIdentity(): BrandIdentity {
  return {
    name: "Brand",
    personality: [],
    values: [],
    voice: { tone: "professional", style: "concise", vocabulary: [], neverSay: [] },
    targetAudience: "",
    guidelines: "",
  };
}

function getEmptyShortTermMemory(sessionId: string): ShortTermMemory {
  return {
    sessionId,
    conversationHistory: [],
    activeContext: {},
  };
}

function getEmptyLongTermMemory(): LongTermMemory {
  return {
    synthesizedLearnings: [],
    pastDecisions: [],
    brandContextCache: {},
  };
}

/**
 * Build a full ExecutionContext for a session.
 */
export function buildExecutionContext(sessionId: string): ExecutionContext {
  return {
    sessionId,
    brandIdentity: parseSoulFile(),
    guardrails: parseGuardrailsFile(),
    shortTermMemory: getEmptyShortTermMemory(sessionId),
    longTermMemory: getEmptyLongTermMemory(),
  };
}
