import { z } from "zod";

export const SkillCandidateSchema = z.object({
  id: z.string(),
  capability: z.string().min(1),
  description: z.string().min(1),
  suggestedSkillFile: z
    .string()
    .min(1)
    .default("skills/learned/new-agent-skill.md"),
  triggerPatterns: z.array(z.string()).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  requiresApproval: z.boolean().default(false),
  source: z.enum(["agency", "manual", "autonomous"]).default("agency"),
  addedAt: z.string(),
  lastUsedAt: z.string().nullable().default(null),
  usageCount: z.number().default(0),
});

export const SkillCandidatesFileSchema = z.object({
  version: z.string().default("1.0.0"),
  lastUpdated: z.string(),
  candidates: z.array(SkillCandidateSchema),
});

export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;
export type SkillCandidatesFile = z.infer<typeof SkillCandidatesFileSchema>;
