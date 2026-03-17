import { task, logger } from "@trigger.dev/sdk/v3";
import {
  sendRouteLearningMessage,
  pollForRouteInfo,
  postRouteLearningConfirmation,
} from "../routing/route-learning-escalation.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import type { LearnedRoute } from "../routing/learned-routes-schema.js";
import type { AgentResult } from "../core/types.js";

// ── Types ───────────────────────────────────────────────────

export interface LearnRoutePayload {
  subtaskDescription: string;
  subtaskInput: Record<string, unknown>;
  agentId: string;
  runId: string;
  timeoutMinutes?: number;
}

export interface LearnRouteResult {
  learned: boolean;
  route?: LearnedRoute;
  fetchResult?: AgentResult;
  fallbackUsed: boolean;
}

// ── Template Resolution ─────────────────────────────────────

function resolveTemplateString(
  template: string,
  params: Record<string, unknown>
): string {
  return template
    // {{ENV_VAR}} → process.env value
    .replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, envVar) => process.env[envVar] ?? "")
    // {{input.key}} → params value
    .replace(/\{\{input\.(\w+)\}\}/g, (_, key) => String(params[key] ?? ""));
}

function resolveTemplateObject(
  obj: Record<string, string>,
  params: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, resolveTemplateString(v, params)])
  );
}

// ── Keyword Extraction ──────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "for", "to", "of", "in", "and", "or",
  "what", "how", "get", "show", "me", "my", "our", "us", "can", "you",
  "this", "that", "with", "from", "about", "all", "by", "on", "at",
  "be", "do", "does", "did", "will", "would", "could", "should",
]);

function extractKeywords(description: string): string[] {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Generate bigrams (two-word phrases)
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }

  return [...new Set([...bigrams, ...words])];
}

// ── Task ────────────────────────────────────────────────────

/**
 * Learn Route Task
 *
 * Triggered when a subtask falls back to "general" and no learned route exists.
 *
 * 1. Sends Slack message asking marketer for API endpoint
 * 2. Polls thread for reply with URL
 * 3. Saves learned route to knowledge/learned-routes.json
 * 4. Immediately fetches data from the learned endpoint
 * 5. Returns fetched data as the subtask result
 */
export const learnRouteTask = task({
  id: "learn-route",
  retry: { maxAttempts: 1 },
  run: async (payload: LearnRoutePayload): Promise<LearnRouteResult> => {
    // learn-route is also a standalone task process; preload DB-backed routes.
    await learnedRoutesStore.load();

    const {
      subtaskDescription,
      subtaskInput,
      agentId,
      runId,
      timeoutMinutes = 30,
    } = payload;

    logger.info("Route learning triggered", {
      description: subtaskDescription.slice(0, 100),
      agentId,
      runId,
    });

    // ── 1. Send Slack message ───────────────────────────────
    let slackRef: { channel: string; ts: string };

    try {
      slackRef = await sendRouteLearningMessage(
        { subtaskDescription, subtaskInput, agentId, runId },
        timeoutMinutes
      );
    } catch (error) {
      logger.error("Failed to send route learning message", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { learned: false, fallbackUsed: true };
    }

    // ── 2. Poll for reply ───────────────────────────────────
    const result = await pollForRouteInfo(
      slackRef.channel,
      slackRef.ts,
      timeoutMinutes * 60,
      30
    );

    if (result.timedOut || !result.learned || !result.route) {
      logger.warn("Route learning timed out or no route provided");
      await postRouteLearningConfirmation(slackRef.channel, slackRef.ts, {
        learned: false,
        timedOut: result.timedOut,
      });
      return { learned: false, fallbackUsed: true };
    }

    // ── 3. Save the learned route ───────────────────────────
    const newRoute = await learnedRoutesStore.addRoute({
      capability: agentId !== "general" ? agentId : extractKeywords(subtaskDescription).slice(0, 3).join("-"),
      description: subtaskDescription,
      matchPatterns: extractKeywords(subtaskDescription),
      routeType: "api",
      endpoint: {
        url: result.route.url,
        method: result.route.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        headers: result.route.headers,
        queryParams: result.route.queryParams,
      },
      addedBy: result.respondedBy ?? "unknown",
    });

    logger.info("Learned route saved", {
      routeId: newRoute.id,
      capability: newRoute.capability,
      endpoint: newRoute.endpoint?.url,
    });

    await learnedRoutesStore.upsertSlackHitlThreadForAdmin({
      kind: "route-learning",
      channel: slackRef.channel,
      messageTs: slackRef.ts,
      threadTs: slackRef.ts,
      status: "route_added",
      routeId: newRoute.id,
      addedRouteId: newRoute.id,
      respondedBy: result.respondedBy ?? null,
      responseText: result.rawReply ?? null,
      resolvedAt: new Date().toISOString(),
      metadata: {
        endpoint: newRoute.endpoint?.url ?? null,
        capability: newRoute.capability,
      },
    });

    // ── 4. Immediately fetch data ───────────────────────────
    let fetchResult: AgentResult;

    try {
      if (!newRoute.endpoint) {
        throw new Error("Learned route endpoint missing");
      }

      const resolvedUrl = resolveTemplateString(newRoute.endpoint.url, subtaskInput);
      const resolvedHeaders = resolveTemplateObject(
        newRoute.endpoint.headers ?? {},
        subtaskInput
      );
      const resolvedParams = resolveTemplateObject(
        newRoute.endpoint.queryParams ?? {},
        subtaskInput
      );

      // Build URL with query params
      const url = new URL(resolvedUrl);
      for (const [key, value] of Object.entries(resolvedParams)) {
        if (value) url.searchParams.set(key, value);
      }

      logger.info("Fetching data from learned endpoint", {
        url: url.toString(),
        method: newRoute.endpoint.method,
      });

      const response = await fetch(url.toString(), {
        method: newRoute.endpoint.method,
        headers: resolvedHeaders,
        ...(newRoute.endpoint.bodyTemplate && newRoute.endpoint.method !== "GET"
          ? { body: JSON.stringify(newRoute.endpoint.bodyTemplate) }
          : {}),
      });

      const data = newRoute.outputFormat === "json"
        ? await response.json()
        : await response.text();

      await learnedRoutesStore.incrementUsage(newRoute.id, {
        runId,
        agentId,
      });

      fetchResult = {
        success: response.ok,
        output: JSON.stringify({
          routeId: newRoute.id,
          endpoint: url.toString(),
          statusCode: response.status,
          data,
          fetchedAt: new Date().toISOString(),
        }),
        modelUsed: "api-fetcher (learned-route)",
      };

      logger.info("Data fetched successfully from learned endpoint", {
        routeId: newRoute.id,
        statusCode: response.status,
      });
    } catch (error) {
      logger.warn("Immediate fetch from learned endpoint failed", {
        routeId: newRoute.id,
        error: error instanceof Error ? error.message : String(error),
      });

      fetchResult = {
        success: false,
        output: JSON.stringify({
          routeId: newRoute.id,
          error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
          note: "Route was saved successfully. It may work in future requests.",
        }),
        modelUsed: "api-fetcher (learned-route)",
      };
    }

    // ── 5. Confirm in Slack ─────────────────────────────────
    await postRouteLearningConfirmation(slackRef.channel, slackRef.ts, {
      learned: true,
      routeId: newRoute.id,
      endpoint: newRoute.endpoint?.url,
      timedOut: false,
    });

    return {
      learned: true,
      route: newRoute,
      fetchResult,
      fallbackUsed: false,
    };
  },
});
