import type { Tool } from "ai";
import { BaseAgent } from "./base-agent.js";
import type { AgentConfig, ExecutionContext } from "../core/types.js";
import { getModelAssignment } from "../config/models.js";

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
  constructor(config?: Partial<AgentConfig>) {
    super({ ...DEFAULT_CONFIG, ...config });
  }

  getTools(_context: ExecutionContext): Record<string, Tool> {
    // Notification tools are handled at the trigger.dev deliver task level
    return {};
  }

  buildSystemPrompt(context: ExecutionContext): string {
    const brand = context.brandIdentity;
    const guardrails = context.guardrails;

    return `You are the Interface Agent in a multi-agent marketing platform for "${brand.name}".

Your role is to format the final response for the marketer and decide on notifications.

## Brand Voice
- Tone: ${brand.voice.tone}
- Style: ${brand.voice.style}
- Never say: ${brand.voice.neverSay.join(", ")}

## Brand Voice Rules
${guardrails.brandVoiceRules.map((r) => `- ${r}`).join("\n")}

## Instructions

You will receive the aggregated results from the pipeline execution.
Your job is to:

1. Format a clear, actionable response for the marketer.
2. Follow the brand voice guidelines strictly.
3. Determine if any notifications should be sent.
4. For each notification, specify the channel (email/slack/webhook), recipient, and priority.

## Output Format

Return a JSON object with this structure:
{
  "formattedResponse": "The response text for the marketer, using brand voice",
  "notifications": [
    {
      "channel": "slack",
      "recipient": "#marketing-alerts",
      "subject": "Alert subject",
      "body": "Alert body text",
      "priority": "info"
    }
  ]
}

If no notifications are needed, return an empty array for "notifications".
Always prioritize clarity and actionability in the formattedResponse.`;
  }
}

export const interfaceAgent = new InterfaceAgent();
