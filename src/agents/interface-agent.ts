import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";
import { loadAgentPromptSpec } from "../tools/agent-spec-loader.js";

const DEFAULT_CONFIG: AgentConfig = {
  id: "interface",
  name: "Interface Agent",
  description:
    "Formats the pipeline output for the marketer and determines which notifications to send.",
  ...getModelAssignment("interface"),
  preferredModel: getModelAssignment("interface").preferred,
  fallbackModels: getModelAssignment("interface").fallbacks,
  maxSteps: 3,
  temperature: 0.3,
  systemPrompt: "",
  autonomyLevel: {
    canSchedule: false,
    canDelegate: false,
    canDecide: true,
    canRetry: true,
    maxDelegationDepth: 0,
  },
  trustBoundary: {
    allowedTools: [],
    blockedActions: [],
    requiresApproval: ["send-notification"],
    maxTokenBudget: 10_000,
  },
};

type PromptLoader = typeof loadAgentPromptSpec;

export const INTERFACE_SYSTEM_PROMPT_FILE =
  "knowledge/agents/interface/system-prompt.md";

export const INTERFACE_SYSTEM_PROMPT_FALLBACK = `You are the Interface Agent in a multi-agent marketing platform for "{{BRAND_NAME}}".

Your role is to format the final response for the current audience and decide on notifications.

## Brand Voice
- Tone: {{BRAND_TONE}}
- Style: {{BRAND_STYLE}}
- Never say: {{BRAND_NEVER_SAY}}

## Brand Voice Rules
{{BRAND_VOICE_RULES}}

## Current Audience
{{AUDIENCE_MODE}}

## Instructions

You will receive the aggregated results from the pipeline execution.
The input may include:
- "criticalFacts": must-include facts extracted from agency output
- "renderRequirements": human-readable formatting requirements derived from guardrails
- "cognition": reasoning/plan context from the cognition phase
Your job is to:

1. Format a clear, actionable response for the current audience.
2. {{VOICE_INSTRUCTION}}
3. Determine if any notifications should be sent.
4. For each notification, specify the channel (email/slack/webhook), recipient, and priority.
5. For marketer-facing warnings/issues, include a Slack monitoring notification to SLACK_MARKETERS_MONITORING_CHANNEL.
6. If needsHumanReview is true for marketer review, notify SLACK_MARKETERS_HITL_CHANNEL.
7. If needsHumanReview is true for admin escalation, notify SLACK_ADMIN_HITL_CHANNEL.
8. For technical/system failures, include a Slack monitoring notification to SLACK_ADMIN_MONITORING_CHANNEL.
9. Preserve critical facts from "criticalFacts" in the final response; do not drop them.
10. {{FORMAT_INSTRUCTION}}
11. Use a readable markdown structure with these sections:
   - Executive Summary
   - Key Findings
   - Data Source and Time Window
   - Recommended Next Step
12. If the pipeline suggests creating a reusable capability, mention that a new learned skill should be created from ./skills/universal-agent-skill-creator.md and saved under ./skills/learned.

## Output Format

Return a JSON object with this structure:
{
  "formattedResponse": "The response text for the current audience",
  "notifications": [
    {
      "channel": "slack",
      "recipient": "#brand-cp-hitl",
      "subject": "Alert subject",
      "body": "Alert body text",
      "priority": "info"
    }
  ]
}

If no notifications are needed, return an empty array for "notifications".
Always prioritize clarity and actionability in the formattedResponse.`;

/**
 * Interface Agent
 *
 * Fourth and final stage of the guardrail pipeline.
 * Takes the aggregated results from the Agency stage and:
 * 1. Formats a human-friendly response for the marketer
 * 2. Determines which notifications should be sent (and via which channel)
 * 3. Applies brand voice rules to the output
 */
export class InterfaceAgent extends BaseAgent {
  private promptLoader: PromptLoader;
  private promptFile: string;

  constructor(
    config?: Partial<AgentConfig>,
    options?: { promptLoader?: PromptLoader; promptFile?: string }
  ) {
    super({ ...DEFAULT_CONFIG, ...config });
    this.promptLoader = options?.promptLoader ?? loadAgentPromptSpec;
    this.promptFile = options?.promptFile ?? INTERFACE_SYSTEM_PROMPT_FILE;
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Notification tools are handled at the trigger.dev deliver task level
    return {};
  }

  buildSystemPrompt(context: ExecutionContext): string {
    const audienceMode =
      context.requestContext.audience === "admin"
        ? "Audience: admin operator. Focus on operational clarity, observability, and direct system-language."
        : "Audience: marketer. Use the brand voice and provide marketer-facing guidance.";
    const voiceInstruction =
      context.requestContext.audience === "admin"
        ? "Use direct operational language. Do not force marketer brand voice into admin answers."
        : "Follow the brand voice guidelines strictly.";
    const formatInstruction =
      context.requestContext.audience === "admin"
        ? "Prefer concise operational summaries, metrics, and trace-friendly wording."
        : "Prefer concise marketer-facing summaries, recommendations, and clear next steps.";
    const vars = {
      BRAND_NAME: context.brandIdentity.name,
      BRAND_TONE: context.brandIdentity.voice.tone,
      BRAND_STYLE: context.brandIdentity.voice.style,
      BRAND_NEVER_SAY: context.brandIdentity.voice.neverSay.join(", "),
      BRAND_VOICE_RULES: context.guardrails.brandVoiceRules
        .map((rule) => `- ${rule}`)
        .join("\n"),
      AUDIENCE_MODE: audienceMode,
      VOICE_INSTRUCTION: voiceInstruction,
      FORMAT_INSTRUCTION: formatInstruction,
    };

    return this.promptLoader(
      this.config.id,
      this.promptFile,
      INTERFACE_SYSTEM_PROMPT_FALLBACK,
      vars
    );
  }
}

export const interfaceAgent = new InterfaceAgent();
