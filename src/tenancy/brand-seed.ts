import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BrandIdentity, GuardrailConstraints } from "../core/types.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

export function parseSoulFile(filePath?: string): BrandIdentity {
  const defaultSoulPath = resolve(PROJECT_ROOT, "knowledge/soul.md");
  const legacySoulPath = resolve(PROJECT_ROOT, "soul.md");
  const soulPath =
    filePath ??
    (existsSync(defaultSoulPath) ? defaultSoulPath : legacySoulPath);
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

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      name = trimmed.replace(/^#\s+/, "").replace(/^Brand Identity:\s*/i, "");
      continue;
    }

    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.replace(/^##\s+/, "").toLowerCase();
      continue;
    }

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

    if (trimmed.startsWith("- ")) {
      const item = trimmed.replace(/^-\s+/, "");
      if (currentSection === "personality") personality.push(item);
      else if (currentSection === "values") values.push(item);
      else if (currentSection.includes("never")) voice.neverSay.push(item);
      else if (currentSection.includes("vocabulary")) voice.vocabulary.push(item);
    }

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
      else if (currentSection.includes("content") || currentSection.includes("polic")) {
        constraints.contentPolicies.push(item);
      }
    }
  }

  return constraints;
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

export function mergeGuardrailConstraints(
  base: GuardrailConstraints,
  extension?: Partial<GuardrailConstraints> | null
): GuardrailConstraints {
  return {
    neverDo: dedupeStringList([...(base.neverDo ?? []), ...(extension?.neverDo ?? [])]),
    alwaysDo: dedupeStringList([...(base.alwaysDo ?? []), ...(extension?.alwaysDo ?? [])]),
    brandVoiceRules: dedupeStringList([
      ...(base.brandVoiceRules ?? []),
      ...(extension?.brandVoiceRules ?? []),
    ]),
    contentPolicies: dedupeStringList([
      ...(base.contentPolicies ?? []),
      ...(extension?.contentPolicies ?? []),
    ]),
  };
}

export function parseMergedGuardrailsFile(options?: {
  baseFilePath?: string;
  extensionFilePath?: string;
}): GuardrailConstraints {
  const base = parseGuardrailsFile(options?.baseFilePath);
  if (!options?.extensionFilePath) return base;
  return mergeGuardrailConstraints(base, parseGuardrailsFile(options.extensionFilePath));
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export function getDefaultBrandIdentity(): BrandIdentity {
  return {
    name: "Brand",
    personality: [],
    values: [],
    voice: { tone: "professional", style: "concise", vocabulary: [], neverSay: [] },
    targetAudience: "",
    guidelines: "",
  };
}

export function getSystemAdminIdentity(): BrandIdentity {
  return {
    name: "Framework Admin",
    personality: ["Operational", "Precise", "Observability-first"],
    values: ["Reliability", "Traceability", "Safety"],
    voice: {
      tone: "precise and direct",
      style: "operational",
      vocabulary: ["run", "trace", "telemetry", "agent", "route"],
      neverSay: ["marketing spin", "brand flourish"],
    },
    targetAudience: "Platform administrators and operators",
    guidelines:
      "Use operational language, emphasize traceability, and surface system facts before recommendations.",
  };
}

export function getSystemAdminGuardrails(): GuardrailConstraints {
  return {
    neverDo: [
      "Do not present marketer brand voice as admin system guidance.",
      "Do not mutate customer-facing settings without explicit admin action.",
    ],
    alwaysDo: [
      "Always surface concrete identifiers, counts, and timestamps for operational claims.",
      "Always distinguish global system context from brand-scoped context.",
    ],
    brandVoiceRules: [
      "Prefer concise operational summaries.",
      "Lead with metrics and evidence, not marketing phrasing.",
    ],
    contentPolicies: [
      "Keep admin chat read-only unless an explicit future admin action path is introduced.",
    ],
  };
}
