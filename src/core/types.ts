import { z } from "zod";

// ── Agent Phase & Status ───────────────────────────────────
export type GuardrailPhase = "grounding" | "cognition" | "agency" | "interface";

export type SubAgentStatus =
  | "pending"
  | "running"
  | "retrying"
  | "completed"
  | "failed"
  | "escalated";

// ── Brand Identity (parsed from soul.md) ───────────────────
export interface BrandIdentity {
  name: string;
  personality: string[];
  values: string[];
  voice: {
    tone: string;
    style: string;
    vocabulary: string[];
    neverSay: string[];
  };
  targetAudience: string;
  guidelines: string; // raw markdown content
}

// ── Guardrail Constraints ──────────────────────────────────
export interface GuardrailConstraints {
  neverDo: string[];
  alwaysDo: string[];
  brandVoiceRules: string[];
  contentPolicies: string[];
}

// ── Autonomy & Trust ───────────────────────────────────────
export interface AutonomyLevel {
  canSchedule: boolean;
  canDelegate: boolean;
  canDecide: boolean;
  canRetry: boolean;
  maxDelegationDepth: number;
}

export interface TrustBoundary {
  allowedTools: string[];
  blockedActions: string[];
  requiresApproval: string[];
  maxTokenBudget: number;
}

// ── Agent Configuration ────────────────────────────────────
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  preferredModel: string; // registry key e.g. "anthropic:fast"
  fallbackModels: string[]; // ordered fallback list
  maxSteps: number;
  temperature: number;
  systemPrompt: string;
  autonomyLevel: AutonomyLevel;
  trustBoundary: TrustBoundary;
}

// ── Agent Result (returned by BaseAgent.execute) ───────────
export interface AgentResult {
  success: boolean;
  output: unknown;
  modelUsed: string;
  tokensUsed?: number;
  durationMs?: number;
  steps?: number;
}

// ── Memory ─────────────────────────────────────────────────
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ShortTermMemory {
  sessionId: string;
  conversationHistory: Message[];
  activeContext: Record<string, unknown>;
}

export interface LongTermMemory {
  synthesizedLearnings: string[];
  pastDecisions: Array<{
    task: string;
    decision: string;
    outcome: string;
  }>;
  brandContextCache: Record<string, unknown>;
}

// ── Execution Context ──────────────────────────────────────
export interface ExecutionContext {
  sessionId: string;
  brandIdentity: BrandIdentity;
  guardrails: GuardrailConstraints;
  shortTermMemory: ShortTermMemory;
  longTermMemory: LongTermMemory;
}

// ── Pipeline Payload & Result ──────────────────────────────
export interface PipelinePayload {
  userMessage: string;
  sessionId: string;
}

export interface PipelineResult {
  formattedResponse: string;
  notifications: NotificationRequest[];
  trace: TraceEntry[];
}

// ── Sub-Task (produced by Cognition, consumed by Agency) ───
export interface SubTask {
  id: string;
  agentId: string; // which sub-agent to run
  description: string;
  input: Record<string, unknown>;
  dependencies: string[]; // IDs of subtasks this depends on
  priority: "low" | "medium" | "high" | "critical";
}

// ── Trace Entry (Observability) ────────────────────────────
export interface TraceEntry {
  timestamp: Date;
  phase: GuardrailPhase | "orchestration" | "sub-agent" | "notification";
  agent: string;
  action: string;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  modelUsed?: string;
  durationMs?: number;
}

// ── Notifications ──────────────────────────────────────────
export type NotificationChannel = "email" | "slack" | "webhook";
export type NotificationPriority = "info" | "warning" | "critical";

export interface NotificationRequest {
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  priority: NotificationPriority;
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ── Human-in-the-Loop Escalation ───────────────────────────
export interface HumanEscalation {
  runId: string;
  taskDescription: string;
  reason: string;
  severity: "info" | "warning" | "error" | "critical";
  notifyMarketer: boolean;
  notifyAdmin: boolean;
  context: Record<string, unknown>;
}

// ── Sub-Agent Plugin Interface ─────────────────────────────
export interface SubAgentPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  execute(
    input: unknown,
    context: ExecutionContext
  ): Promise<AgentResult>;
}

// ── Grounding Result ───────────────────────────────────────
export interface GroundingResult {
  brandIdentity: BrandIdentity;
  guardrails: GuardrailConstraints;
  context: ExecutionContext;
}

// ── Cognition Result ───────────────────────────────────────
export interface CognitionResult {
  subtasks: SubTask[];
  reasoning: string;
  plan: string;
}

// ── Agency Result ──────────────────────────────────────────
export interface AgencyResult {
  results: Array<{
    subtaskId: string;
    agentId: string;
    result: AgentResult;
  }>;
  summary: string;
}

// ── Interface/Delivery Result ──────────────────────────────
export interface DeliveryResult {
  formattedResponse: string;
  notifications: NotificationRequest[];
}
