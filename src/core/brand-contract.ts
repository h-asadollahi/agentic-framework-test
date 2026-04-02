import { createHash } from "node:crypto";
import type {
  BrandContract,
  BrandIdentity,
  GuardrailConstraints,
  RequestAudience,
  RequestScope,
} from "./types.js";

const contractCache = new Map<string, BrandContract>();

function hashValue(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function buildJudgementNotes(
  brandIdentity: BrandIdentity,
  guardrails: GuardrailConstraints,
  audience: RequestAudience
): string[] {
  const notes = [
    `Brand "${brandIdentity.name}" voice: ${brandIdentity.voice.tone}, ${brandIdentity.voice.style}`,
    `Always keep these non-negotiables visible: ${guardrails.alwaysDo.slice(0, 4).join("; ")}`,
    `Never violate these constraints: ${guardrails.neverDo.slice(0, 4).join("; ")}`,
  ];

  if (audience === "admin") {
    notes.push(
      "Audience is admin. Prefer operational clarity and preserve human control for critical actions."
    );
  } else {
    notes.push(
      `Audience is marketer. Stay within brand voice and content policy for ${brandIdentity.targetAudience || "the current brand audience"}.`
    );
  }

  return notes.filter((note) => note.trim().length > 0);
}

export function createBrandContract(options: {
  brandId: string | null;
  audience: RequestAudience;
  scope: RequestScope;
  brandIdentity: BrandIdentity;
  guardrails: GuardrailConstraints;
}): BrandContract {
  const sourceHash = hashValue({
    brandId: options.brandId,
    audience: options.audience,
    scope: options.scope,
    brandIdentity: options.brandIdentity,
    guardrails: options.guardrails,
  });
  const cacheKey = `${options.brandId ?? "system"}:${options.audience}:${options.scope}:${sourceHash}`;
  const cached = contractCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const contract: BrandContract = {
    brandId: options.brandId,
    audience: options.audience,
    scope: options.scope,
    identity: options.brandIdentity,
    guardrails: options.guardrails,
    judgementNotes: buildJudgementNotes(
      options.brandIdentity,
      options.guardrails,
      options.audience
    ),
    hash: sourceHash,
    version: sourceHash.slice(0, 12),
  };

  contractCache.set(cacheKey, contract);
  return contract;
}

export function buildBrandContractSummary(contract: BrandContract): string {
  return [
    `Brand: ${contract.identity.name}`,
    `Audience: ${contract.audience}`,
    `Voice: ${contract.identity.voice.tone}, ${contract.identity.voice.style}`,
    `Always do: ${contract.guardrails.alwaysDo.slice(0, 4).join("; ") || "none"}`,
    `Never do: ${contract.guardrails.neverDo.slice(0, 4).join("; ") || "none"}`,
  ].join(" | ");
}

export function clearBrandContractCache(): void {
  contractCache.clear();
}
