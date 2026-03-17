import { z } from "zod";

const BrandVoiceSchema = z.object({
  tone: z.string().default("professional"),
  style: z.string().default("concise"),
  vocabulary: z.array(z.string()).default([]),
  neverSay: z.array(z.string()).default([]),
});

export const BrandIdentitySchema = z.object({
  name: z.string().default("Brand"),
  personality: z.array(z.string()).default([]),
  values: z.array(z.string()).default([]),
  voice: BrandVoiceSchema.default({
    tone: "professional",
    style: "concise",
    vocabulary: [],
    neverSay: [],
  }),
  targetAudience: z.string().default(""),
  guidelines: z.string().default(""),
});

export const GuardrailConstraintsSchema = z.object({
  neverDo: z.array(z.string()).default([]),
  alwaysDo: z.array(z.string()).default([]),
  brandVoiceRules: z.array(z.string()).default([]),
  contentPolicies: z.array(z.string()).default([]),
});

export const BrandConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  brandIdentity: BrandIdentitySchema,
  guardrails: GuardrailConstraintsSchema,
  channelRules: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;
