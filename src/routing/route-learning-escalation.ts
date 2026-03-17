import { WebClient } from "@slack/web-api";
import { wait } from "@trigger.dev/sdk/v3";
import { logger } from "../core/logger.js";
import { learnedRoutesStore } from "./learned-routes-store.js";

// ── Types ───────────────────────────────────────────────────

export interface RouteLearningRequest {
  subtaskDescription: string;
  subtaskInput: Record<string, unknown>;
  agentId: string;
  runId: string;
}

export interface ParsedRouteInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

export interface RouteLearningResult {
  learned: boolean;
  route?: ParsedRouteInfo;
  rawReply?: string;
  respondedBy?: string;
  timedOut: boolean;
}

interface SlackMessageRef {
  channel: string;
  ts: string;
}

// ── Slack client ────────────────────────────────────────────

function getSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set — cannot send route learning messages");
  }
  return new WebClient(token);
}

function getDefaultChannel(): string {
  return (
    process.env.SLACK_ADMIN_HITL_CHANNEL ??
    process.env.SLACK_MARKETERS_HITL_CHANNEL ??
    process.env.SLACK_DEFAULT_CHANNEL ??
    "#brand-cp-hitl"
  );
}

function getChannelCandidates(): string[] {
  const candidates = [
    process.env.SLACK_ADMIN_HITL_CHANNEL,
    process.env.SLACK_MARKETERS_HITL_CHANNEL,
    process.env.SLACK_DEFAULT_CHANNEL,
    "#brand-cp-hitl",
  ].filter((value): value is string => Boolean(value && value.trim()));

  return [...new Set(candidates)];
}

// ── Send route learning message ─────────────────────────────

/**
 * Send a Block Kit message asking the marketer for API endpoint info.
 */
export async function sendRouteLearningMessage(
  request: RouteLearningRequest,
  timeoutMinutes: number
): Promise<SlackMessageRef> {
  const client = getSlackClient();
  const fallbackChannel = getDefaultChannel();
  const channels = getChannelCandidates();

  const blocks = [
    {
      type: "header" as const,
      text: {
        type: "plain_text" as const,
        text: ":mag: Unknown Data Request",
        emoji: true,
      },
    },
    { type: "divider" as const },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: [
          "The agent received a request it doesn't know how to fulfill:",
          "",
          `> _"${request.subtaskDescription}"_`,
          "",
          `*Agent ID:* \`${request.agentId}\``,
          `*Run ID:* \`${request.runId}\``,
        ].join("\n"),
      },
    },
    { type: "divider" as const },
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: [
          "*Reply in this thread with the API endpoint info:*",
          "",
          "> `URL:` https://api.example.com/v1/data _(required)_",
          "> `Method:` GET _(optional, defaults to GET)_",
          "> `Headers:` Authorization: Bearer {{API_KEY_NAME}} _(optional)_",
          "> `Params:` campaignId, dateRange _(optional)_",
          "",
          "Or just paste the URL and I'll figure out the rest.",
        ].join("\n"),
      },
    },
    {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: `:clock1: _This request will auto-skip in ${timeoutMinutes} minutes if no response. The route will be saved for future use._`,
        },
      ],
    },
  ];

  let lastError: unknown = null;

  for (const channel of channels) {
    try {
      const result = await client.chat.postMessage({
        channel,
        text: `Unknown data request: ${request.subtaskDescription}`,
        blocks,
      });

      if (!result.ok || !result.ts) {
        throw new Error(`Failed to send route learning message: ${result.error ?? "unknown"}`);
      }

      const resolvedChannel = result.channel ?? channel;

      logger.info("Route learning message sent to Slack", {
        channel: resolvedChannel,
        ts: result.ts,
        description: request.subtaskDescription.slice(0, 80),
      });

      await learnedRoutesStore.upsertSlackHitlThreadForAdmin({
        kind: "route-learning",
        channel: resolvedChannel,
        messageTs: result.ts,
        threadTs: result.ts,
        status: "sent",
        taskDescription: request.subtaskDescription,
        runId: request.runId,
        agentId: request.agentId,
        metadata: {
          timeoutMinutes,
          subtaskInputKeys: Object.keys(request.subtaskInput ?? {}).sort(),
        },
      });

      return { channel: resolvedChannel, ts: result.ts };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("channel_not_found")) {
        logger.warn("Route learning channel not found, trying next configured channel", {
          attemptedChannel: channel,
          description: request.subtaskDescription.slice(0, 80),
        });
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to send route learning message to all channel candidates (fallback: ${fallbackChannel})`);
}

// ── Parse route info from reply ─────────────────────────────

/**
 * Extract API endpoint info from a free-form Slack reply.
 *
 * Supports multiple formats:
 *   - Just a URL: "https://api.example.com/v1/data"
 *   - Structured: "URL: https://... Method: POST Headers: Auth: Bearer {{KEY}}"
 *   - Mixed free-form text with a URL embedded
 */
export function parseRouteInfoReply(text: string): ParsedRouteInfo | null {
  // 1. Extract URL (required)
  const urlMatch = text.match(/https?:\/\/[^\s>]+/);
  if (!urlMatch) return null;

  const url = urlMatch[0].replace(/[.,;)]+$/, ""); // strip trailing punctuation

  // 2. Extract HTTP method
  const methodMatch = text.match(/\b(?:method\s*:\s*)?(GET|POST|PUT|PATCH|DELETE)\b/i);
  const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";

  // 3. Extract headers (look for "Header(s):" or "Auth:" patterns)
  const headers: Record<string, string> = {};
  const headerPatterns = [
    /(?:headers?\s*:\s*)(.+?)(?:\n|$)/gi,
    /(?:auth(?:orization)?\s*:\s*)(.+?)(?:\n|$)/gi,
  ];

  for (const pattern of headerPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const headerValue = match[1].trim();
      if (headerValue.includes(":")) {
        // "Authorization: Bearer {{KEY}}" → split on first ":"
        const colonIdx = headerValue.indexOf(":");
        const key = headerValue.slice(0, colonIdx).trim();
        const value = headerValue.slice(colonIdx + 1).trim();
        headers[key] = value;
      } else if (headerValue.toLowerCase().startsWith("bearer")) {
        headers["Authorization"] = headerValue;
      }
    }
  }

  // 4. Extract query params (look for "Params:" or "Parameters:" patterns)
  const queryParams: Record<string, string> = {};
  const paramsMatch = text.match(/(?:params?\s*:\s*)(.+?)(?:\n|$)/i);
  if (paramsMatch) {
    const paramsList = paramsMatch[1].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    for (const param of paramsList) {
      // Support "key=value" or just "key"
      const eqIdx = param.indexOf("=");
      if (eqIdx > 0) {
        queryParams[param.slice(0, eqIdx).trim()] = param.slice(eqIdx + 1).trim();
      } else {
        queryParams[param] = `{{input.${param}}}`;
      }
    }
  }

  return { url, method, headers, queryParams };
}

// ── Poll for route info ─────────────────────────────────────

/**
 * Poll a Slack thread for a reply containing API endpoint info.
 * Uses Trigger.dev wait.for() between polls to free the worker.
 */
export async function pollForRouteInfo(
  channel: string,
  threadTs: string,
  timeoutSeconds: number,
  pollIntervalSeconds: number = 30
): Promise<RouteLearningResult> {
  const client = getSlackClient();
  const maxAttempts = Math.ceil(timeoutSeconds / pollIntervalSeconds);

  logger.info("Starting route learning poll loop", {
    channel,
    threadTs,
    timeoutSeconds,
    maxAttempts,
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await wait.for({ seconds: pollIntervalSeconds });
    }

    try {
      const repliesResult = await client.conversations.replies({
        channel,
        ts: threadTs,
        limit: 20,
      });

      const messages = repliesResult.messages ?? [];
      const replies = messages.slice(1); // skip original message

      for (const reply of replies) {
        const text = reply.text ?? "";
        const userId = reply.user ?? "unknown";

        // Skip bot messages
        if (reply.bot_id) continue;

        // Try to parse route info from the reply
        const parsed = parseRouteInfoReply(text);

        if (parsed) {
          logger.info("Route info received from Slack", {
            url: parsed.url,
            method: parsed.method,
            respondedBy: userId,
          });

          await learnedRoutesStore.upsertSlackHitlThreadForAdmin({
            kind: "route-learning",
            channel,
            messageTs: threadTs,
            threadTs,
            status: "responded",
            respondedBy: userId,
            responseText: text,
            respondedAt: new Date().toISOString(),
            metadata: {
              parsedMethod: parsed.method,
              parsedUrl: parsed.url,
            },
          });

          return {
            learned: true,
            route: parsed,
            rawReply: text,
            respondedBy: userId,
            timedOut: false,
          };
        }

        // If the reply doesn't contain a URL, log and keep polling
        logger.info("Slack reply doesn't contain a URL, continuing poll", {
          replyPreview: text.slice(0, 80),
        });
      }
    } catch (error) {
      logger.warn("Failed to poll Slack thread for route info", {
        error: error instanceof Error ? error.message : String(error),
        attempt: attempt + 1,
      });
    }
  }

  logger.warn("Route learning poll timed out", { channel, threadTs });

  await learnedRoutesStore.upsertSlackHitlThreadForAdmin({
    kind: "route-learning",
    channel,
    messageTs: threadTs,
    threadTs,
    status: "timed_out",
    resolvedAt: new Date().toISOString(),
  });

  return {
    learned: false,
    timedOut: true,
  };
}

// ── Post confirmation ───────────────────────────────────────

/**
 * Post a confirmation message in the route learning thread.
 */
export async function postRouteLearningConfirmation(
  channel: string,
  threadTs: string,
  result: { learned: boolean; routeId?: string; endpoint?: string; timedOut: boolean }
): Promise<void> {
  const client = getSlackClient();

  let text: string;

  if (result.timedOut) {
    text = ":hourglass: *Route learning timed out* — falling back to AI response. No route was saved.";
  } else if (result.learned) {
    text = [
      `:white_check_mark: *Route learned and saved!*`,
      "",
      `*Route ID:* \`${result.routeId}\``,
      `*Endpoint:* \`${result.endpoint}\``,
      "",
      "_This route will be used automatically for similar future requests._",
    ].join("\n");
  } else {
    text = ":warning: *Could not learn route* — the reply didn't contain a valid URL.";
  }

  try {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      mrkdwn: true,
    });
  } catch (error) {
    logger.warn("Failed to post route learning confirmation", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
