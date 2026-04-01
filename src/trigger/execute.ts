import { task, logger } from "@trigger.dev/sdk/v3";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agencyAgent } from "../agents/agency-agent.js";
import { subAgentRegistry } from "./sub-agents/registry.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { learnRouteTask } from "./learn-route.js";
import {
  isSynthesisLikeDescription,
  resolveUnknownSubtaskStrategy,
  shouldUseMatchedLearnedRoute,
} from "./execute-routing.js";
import { parseAgentJson } from "./agent-output-parser.js";
import { hydrateRegisteredSubtaskInput } from "./learned-route-input-hydration.js";
import { resolveExecutionAgentId } from "./route-target-resolution.js";
import { parseAgencySkillSuggestions } from "./agency-skill-suggestions.js";
import {
  buildMcpBuilderAgentResult,
  isMcpBuilderIntent,
} from "./mcp-builder.js";
import {
  buildUniversalSkillCreatorAgentResult,
  isUniversalSkillCreationIntent,
} from "./universal-skill-creator.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
import { inferAdminTokenUsageMonitorRequest } from "./admin-observability.js";
import { agentAuditStore } from "../observability/agent-audit-store.js";
// Register all plugins on import
import "./sub-agents/plugins/index.js";
import type {
  AgencyResult,
  AgentResult,
  CognitionResult,
  ExecutionContext,
  RequestContext,
  SubTask,
} from "../core/types.js";

type ExecutedSubtaskResult = {
  subtaskId: string;
  agentId: string;
  result: AgentResult;
};

type AgencySummaryFastPath = {
  summary: string;
  routeAgentId: string;
  issues?: string[];
};

/**
 * Execute Task (Agency)
 *
 * Third stage of the guardrail pipeline.
 * Executes the subtask plan produced by cognition.
 *
 * Execution strategy:
 * 1. Group subtasks by dependency level (topological sort)
 * 2. For each level, run independent subtasks in parallel via the registry
 * 3. Subtasks whose agentId matches a registered sub-agent run through the plugin
 * 4. Unrecognised agentIds fall back to the Agency LLM agent
 * 5. Aggregate all results into AgencyResult
 */
export const executeTask = task({
  id: "pipeline-execute",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    cognitionResult: CognitionResult;
    context: ExecutionContext;
  }) => {
    // pipeline-execute may run in a different task process than orchestrate/think.
    // Always preload DB-backed stores in this process before any route access.
    await preloadExecutionStores();

    const { subtasks } = payload.cognitionResult;
    const auditBase = {
      pipelineRunId: payload.context.requestContext.pipelineRunId ?? payload.context.sessionId,
      runId: payload.context.requestContext.runId ?? payload.context.sessionId,
      sessionId: payload.context.sessionId,
      phase: "agency",
      componentKind: "task" as const,
      componentId: "pipeline-execute",
      audience: payload.context.requestContext.audience,
      scope: payload.context.requestContext.scope,
      brandId: payload.context.requestContext.brandId,
    };

    logger.info("Starting agency phase", {
      subtaskCount: subtasks.length,
      registeredAgents: subAgentRegistry.list().map((a) => a.id),
    });
    await agentAuditStore.record({
      ...auditBase,
      eventType: "invoke",
      status: "running",
      payload: {
        subtaskCount: subtasks.length,
        subtasks,
      },
    });

    // ── Topological grouping ────────────────────────────────
    const levels = topologicalGroup(subtasks);

    const allResults: ExecutedSubtaskResult[] = [];

    for (const level of levels) {
      logger.info(`Running ${level.length} subtask(s) in parallel`);

      // Run all tasks in this level concurrently
      const levelResults = await Promise.allSettled(
        level.map(async (subtask) => {
          const startTime = Date.now();
          await agentAuditStore.record({
            ...auditBase,
            componentKind: "subtask",
            componentId: subtask.id,
            eventType: "invoke",
            status: "running",
            payload: {
              agentId: subtask.agentId,
              description: subtask.description,
              input: subtask.input,
              dependencies: subtask.dependencies,
            },
          });

          let result: AgentResult;

          const skipSynthesis = shouldSkipSynthesisSubtaskForDeterministicRoute(
            subtask,
            allResults
          );
          if (skipSynthesis.skip) {
            logger.info("Skipping redundant synthesis subtask for deterministic route", {
              subtaskId: subtask.id,
              sourceSubtaskId: skipSynthesis.sourceSubtaskId,
              sourceAgentId: skipSynthesis.sourceAgentId,
            });
            await agentAuditStore.record({
              ...auditBase,
              componentKind: "subtask",
              componentId: subtask.id,
              eventType: "skipped",
              status: "completed",
              payload: {
                reason: "redundant deterministic-route synthesis",
                sourceSubtaskId: skipSynthesis.sourceSubtaskId,
                sourceAgentId: skipSynthesis.sourceAgentId,
              },
            });
            return {
              subtaskId: subtask.id,
              agentId: subtask.agentId,
              result: {
                success: true,
                output: {
                  mode: "deterministic-skip",
                  reason:
                    "Skipped redundant synthesis subtask; deterministic route result will be formatted in later stage.",
                  sourceSubtaskId: skipSynthesis.sourceSubtaskId,
                  sourceAgentId: skipSynthesis.sourceAgentId,
                },
                modelUsed: "deterministic-skip",
                durationMs: Date.now() - startTime,
              },
            };
          }

          if (isDeterministicSkillCreatorAgent(subtask.agentId)) {
            logger.info(
              `Using deterministic universal skill creator workflow for "${subtask.agentId}"`
            );
            await agentAuditStore.record({
              ...auditBase,
              componentKind: "subtask",
              componentId: subtask.id,
              eventType: "decision",
              status: "completed",
              payload: {
                decision: "deterministic-skill-creator",
                agentId: subtask.agentId,
              },
            });
            result = buildUniversalSkillCreatorAgentResult(
              subtask,
              payload.context
            );
            return {
              subtaskId: subtask.id,
              agentId: subtask.agentId,
              result: { ...result, durationMs: Date.now() - startTime },
            };
          }

          if (subAgentRegistry.has(subtask.agentId)) {
            const routeIdFromInput =
              typeof subtask.input?.routeId === "string"
                ? subtask.input.routeId
                : null;
            const learnedRoute = routeIdFromInput
              ? learnedRoutesStore.getById(routeIdFromInput)
              : learnedRoutesStore.findByCapability(
                  subtask.description,
                  payload.context.requestContext
                );
            const targetResolution = resolveExecutionAgentId(
              subtask.agentId,
              learnedRoute,
              (agentId) => subAgentRegistry.has(agentId)
            );

            if (targetResolution.overridden && learnedRoute) {
              logger.warn("Registered sub-agent overridden by learned route target", {
                subtaskId: subtask.id,
                requestedAgentId: subtask.agentId,
                executionAgentId: targetResolution.executionAgentId,
                routeId: learnedRoute.id,
                routeType: learnedRoute.routeType,
                reason: targetResolution.reason,
              });
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "registered-sub-agent-overridden",
                  requestedAgentId: subtask.agentId,
                  executionAgentId: targetResolution.executionAgentId,
                  routeId: learnedRoute.id,
                  reason: targetResolution.reason,
                },
              });
            }

            let executionInput = hydrateRegisteredSubtaskInput(
              { agentId: targetResolution.executionAgentId, input: subtask.input },
              learnedRoute
            );

            if (
              targetResolution.executionAgentId === "api-fetcher" &&
              learnedRoute?.routeType === "api"
            ) {
              executionInput = normalizeApiFetcherInput(
                executionInput,
                learnedRoute.id,
                subtask.description
              );
            }

            // ── Registered sub-agent plugin ───────────────
            result = await subAgentRegistry.execute(
              targetResolution.executionAgentId,
              executionInput,
              payload.context
            );
          } else {
            // ── Smart Fallback Router ─────────────────────
            logger.info(
              `No registered sub-agent for "${subtask.agentId}", checking learned routes`
            );

            // Deterministic special workflows must run before learned-route routing.
            // This prevents MCP/skill creation requests from entering route-learning loops.
            if (isUniversalSkillCreationIntent(subtask)) {
              logger.info(
                `Using universal skill creator workflow for "${subtask.agentId}"`
              );
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "universal-skill-creator-intent",
                  agentId: subtask.agentId,
                },
              });
              result = buildUniversalSkillCreatorAgentResult(
                subtask,
                payload.context
              );
              return {
                subtaskId: subtask.id,
                agentId: subtask.agentId,
                result: { ...result, durationMs: Date.now() - startTime },
              };
            }

            if (isMcpBuilderIntent(subtask)) {
              logger.info(
                `Using MCP builder skill workflow for "${subtask.agentId}"`
              );
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "mcp-builder-intent",
                  agentId: subtask.agentId,
                },
              });
              result = buildMcpBuilderAgentResult(subtask, payload.context);
              return {
                subtaskId: subtask.id,
                agentId: subtask.agentId,
                result: { ...result, durationMs: Date.now() - startTime },
              };
            }

            const materializedSkill = resolveMaterializedSkillGuidance(subtask);
            if (materializedSkill) {
              logger.info(
                `Using materialized learned skill "${materializedSkill.skillFile}" for "${subtask.agentId}"`
              );
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "materialized-skill-guidance",
                  skillFile: materializedSkill.skillFile,
                  candidateId: materializedSkill.candidateId,
                },
              });
              result = await agencyAgent.execute(
                buildAgencyFallbackInput(subtask, { learnedSkill: materializedSkill }),
                payload.context
              );
              return {
                subtaskId: subtask.id,
                agentId: subtask.agentId,
                result: { ...result, durationMs: Date.now() - startTime },
              };
            }

            const adminObservabilityFallback = resolveAdminObservabilityFallback(
              subtask,
              payload.context.requestContext
            );
            if (adminObservabilityFallback) {
              logger.info(
                `Using deterministic admin observability fallback for "${subtask.agentId}"`
              );
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "admin-observability-fallback",
                  executionAgentId: adminObservabilityFallback.agentId,
                },
              });
              result = await subAgentRegistry.execute(
                adminObservabilityFallback.agentId,
                adminObservabilityFallback.input,
                payload.context
              );
              return {
                subtaskId: subtask.id,
                agentId: adminObservabilityFallback.agentId,
                result: { ...result, durationMs: Date.now() - startTime },
              };
            }

            // Step 1: Check learned routes for a match
            const learnedRoute = learnedRoutesStore.findByCapability(
              subtask.description,
              payload.context.requestContext
            );
            const hasExplicitRouteId =
              typeof subtask.input?.routeId === "string" &&
              subtask.input.routeId.trim().length > 0;
            const allowLearnedRoute = shouldUseMatchedLearnedRoute(subtask, {
              hasExplicitRouteId,
            });

            const strategy = resolveUnknownSubtaskStrategy(
              subtask,
              Boolean(learnedRoute),
              {
                hasDeterministicRouteContext:
                  hasDeterministicRouteContext(subtask, allResults),
                allowLearnedRoute,
              }
            );

            if (strategy === "use-learned-route" && learnedRoute) {
              // Use existing learned route target
              logger.info(`Found learned route "${learnedRoute.id}" for "${subtask.agentId}"`, {
                routeType: learnedRoute.routeType,
              });
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "use-learned-route",
                  routeId: learnedRoute.id,
                  routeType: learnedRoute.routeType,
                  targetAgentId: learnedRoute.agentId ?? "api-fetcher",
                },
              });

              if (learnedRoute.routeType === "sub-agent" && learnedRoute.agentId) {
                if (subAgentRegistry.has(learnedRoute.agentId)) {
                  result = await subAgentRegistry.execute(
                    learnedRoute.agentId,
                    {
                      ...(learnedRoute.agentInputDefaults ?? {}),
                      ...(subtask.input ?? {}),
                    },
                    payload.context
                  );
                  await learnedRoutesStore.incrementUsage(learnedRoute.id, {
                    runId:
                      payload.context.requestContext.runId ??
                      payload.context.sessionId,
                    sessionId: payload.context.sessionId,
                    agentId: learnedRoute.agentId,
                    requestContext: payload.context.requestContext,
                  });
                } else {
                  logger.warn(
                    `Learned route "${learnedRoute.id}" points to unknown sub-agent "${learnedRoute.agentId}", falling back to LLM`
                  );
                  result = await agencyAgent.execute(
                    buildAgencyFallbackInput(subtask),
                    payload.context
                  );
                }
              } else {
                result = await subAgentRegistry.execute(
                  "api-fetcher",
                  {
                    routeId: learnedRoute.id,
                    params: subtask.input,
                    description: subtask.description,
                  },
                  payload.context
                );
              }
            } else if (strategy === "learn-new-route") {
              // Step 2: No learned route — trigger Slack HITL to learn one
              logger.info(
                `No learned route for "${subtask.agentId}", triggering route learning`
              );
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "queued",
                payload: {
                  decision: "learn-new-route",
                  description: subtask.description,
                },
              });

              const learnResult = await learnRouteTask.triggerAndWait({
                subtaskDescription: subtask.description,
                subtaskInput: subtask.input,
                agentId: subtask.agentId,
                sessionId: payload.context.sessionId,
                runId:
                  payload.context.requestContext.runId ??
                  payload.context.sessionId,
                requestContext: payload.context.requestContext,
                timeoutMinutes: 30,
              });

              if (
                learnResult.ok &&
                learnResult.output.learned &&
                learnResult.output.fetchResult
              ) {
                // Route learned and data fetched successfully
                await agentAuditStore.record({
                  ...auditBase,
                  componentKind: "subtask",
                  componentId: subtask.id,
                  eventType: "decision",
                  status: "completed",
                  payload: {
                    decision: "route-learned-and-fetched",
                    routeId: learnResult.output.route?.id ?? null,
                  },
                });
                result = learnResult.output.fetchResult;
              } else {
                // Step 3: Final fallback — use the Agency LLM agent
                logger.info(
                  "Route learning failed or timed out, falling back to LLM"
                );
                await agentAuditStore.record({
                  ...auditBase,
                  componentKind: "subtask",
                  componentId: subtask.id,
                  eventType: "decision",
                  status: "warning",
                  payload: {
                    decision: "route-learning-fallback-to-agency",
                    learned: learnResult.ok ? learnResult.output.learned : false,
                  },
                });
                result = await agencyAgent.execute(
                  buildAgencyFallbackInput(subtask),
                  payload.context
                );
              }
            } else {
              logger.info(
                `Unknown subtask "${subtask.agentId}" is not data-oriented, using LLM fallback`
              );
              await agentAuditStore.record({
                ...auditBase,
                componentKind: "subtask",
                componentId: subtask.id,
                eventType: "decision",
                status: "completed",
                payload: {
                  decision: "agency-llm-fallback",
                  description: subtask.description,
                  ignoredLearnedRouteId:
                    learnedRoute && !allowLearnedRoute ? learnedRoute.id : null,
                },
              });
              result = await agencyAgent.execute(
                buildAgencyFallbackInput(subtask),
                payload.context
              );
            }
          }

          await agentAuditStore.record({
            ...auditBase,
            componentKind: "subtask",
            componentId: subtask.id,
            eventType: "result",
            status: result.success ? "completed" : "failed",
            durationMs: Date.now() - startTime,
            payload: {
              agentId: subtask.agentId,
              modelUsed: result.modelUsed,
              output: result.output,
            },
          });

          return {
            subtaskId: subtask.id,
            agentId: subtask.agentId,
            result: { ...result, durationMs: Date.now() - startTime },
          };
        })
      );

      // Collect settled results
      for (const settled of levelResults) {
        if (settled.status === "fulfilled") {
          allResults.push(settled.value);
        } else {
          logger.error("Subtask failed", { error: settled.reason });
          await agentAuditStore.record({
            ...auditBase,
            componentKind: "subtask",
            componentId: "unknown",
            eventType: "error",
            status: "failed",
            payload: {
              message:
                settled.reason instanceof Error
                  ? settled.reason.message
                  : String(settled.reason),
            },
          });
          allResults.push({
            subtaskId: "unknown",
            agentId: "unknown",
            result: {
              success: false,
              output: String(settled.reason),
              modelUsed: "none",
            },
          });
        }
      }
    }

    let agencyResult: AgencyResult;
    let parsedSummary: AgencyResult | null = null;
    const fastPath = buildDeterministicAgencyFastPathSummary(
      payload.cognitionResult,
      allResults
    );

    if (fastPath) {
      agencyResult = {
        results: allResults,
        summary: fastPath.summary,
        ...(fastPath.issues ? { issues: fastPath.issues } : {}),
      };
      logger.info("Agency phase complete (deterministic fast path)", {
        totalSubtasks: allResults.length,
        successful: allResults.filter((r) => r.result.success).length,
        model: "deterministic-fast-path",
        routeAgentId: fastPath.routeAgentId,
      });
      await agentAuditStore.record({
        ...auditBase,
        eventType: "decision",
        status: "completed",
        payload: {
          decision: "deterministic-agency-fast-path",
          routeAgentId: fastPath.routeAgentId,
          issues: fastPath.issues ?? [],
        },
      });
    } else {
      // ── Summarise via the Agency LLM agent ────────────────
      const summaryInput = JSON.stringify({
        plan: payload.cognitionResult.plan,
        reasoning: payload.cognitionResult.reasoning,
        results: allResults.map((r) => ({
          subtaskId: r.subtaskId,
          agentId: r.agentId,
          success: r.result.success,
          output: r.result.output,
        })),
      });

      const summaryResult = await agencyAgent.execute(
        summaryInput,
        payload.context
      );

      logger.info("Agency phase complete", {
        totalSubtasks: allResults.length,
        successful: allResults.filter((r) => r.result.success).length,
        model: summaryResult.modelUsed,
      });

      parsedSummary = parseAgentJson<AgencyResult>(summaryResult.output);
      if (parsedSummary) {
        agencyResult = parsedSummary;
        // Ensure our actual results are included
        agencyResult.results = allResults;
      } else {
        agencyResult = {
          results: allResults,
          summary: (summaryResult.output as string) ?? "Execution complete",
        };
      }
    }

    const { suggestions: rawSuggestions, issue: suggestionIssue } =
      parseAgencySkillSuggestions(parsedSummary);
    if (suggestionIssue) {
      agencyResult.issues = [...(agencyResult.issues ?? []), suggestionIssue];
    }

    if (rawSuggestions.length > 0) {
      // Persistence/materialization happens asynchronously in pipeline-skill-learner.
      // Keep execute focused on response-critical work.
      agencyResult.skillSuggestions = rawSuggestions;
    }

    await agentAuditStore.record({
      ...auditBase,
      eventType: "result",
      status: agencyResult.needsHumanReview ? "warning" : "completed",
      payload: {
        summary: agencyResult.summary,
        issues: agencyResult.issues ?? [],
        needsHumanReview: agencyResult.needsHumanReview ?? false,
        skillSuggestionCount: agencyResult.skillSuggestions?.length ?? 0,
        resultCount: agencyResult.results.length,
      },
    });

    return agencyResult;
  },
});

export async function preloadExecutionStores(): Promise<void> {
  await learnedRoutesStore.load();
  await skillCandidatesStore.load();
}

// ── Helpers ───────────────────────────────────────────────────

export function resolveAdminObservabilityFallback(
  subtask: Pick<SubTask, "agentId" | "description" | "input">,
  requestContext: RequestContext
): {
  agentId: "token-usage-monitor";
  input: NonNullable<ReturnType<typeof inferAdminTokenUsageMonitorRequest>>;
} | null {
  const input = inferAdminTokenUsageMonitorRequest(
    subtask.description,
    requestContext,
    subtask.input
  );
  if (!input) return null;

  return {
    agentId: "token-usage-monitor",
    input,
  };
}

const DETERMINISTIC_ROUTE_AGENT_IDS = new Set([
  "mcp-fetcher",
  "api-fetcher",
  "cohort-monitor",
  "token-usage-monitor",
]);

const ALLOWED_SYNTHESIS_AGENT_IDS = new Set([
  "general",
  "assistant",
  "skill-creator",
  "skill_creator",
  "universal-skill-creator",
]);

function looksLikeSynthesisSubtask(description: string): boolean {
  return isSynthesisLikeDescription(description);
}

function hasDeterministicRouteContext(
  subtask: SubTask,
  completedResults: ExecutedSubtaskResult[]
): boolean {
  const normalizedAgentId = subtask.agentId.trim().toLowerCase();
  if (normalizedAgentId !== "general" && normalizedAgentId !== "assistant") {
    return false;
  }

  const routeIdFromInput =
    typeof subtask.input?.routeId === "string" &&
    subtask.input.routeId.trim().length > 0;
  if (routeIdFromInput) {
    return true;
  }

  return completedResults.some(
    (result) =>
      subtask.dependencies.includes(result.subtaskId) &&
      result.result.success === true &&
      DETERMINISTIC_ROUTE_AGENT_IDS.has(result.agentId)
  );
}

export function buildDeterministicAgencyFastPathSummary(
  cognitionResult: CognitionResult,
  results: ExecutedSubtaskResult[]
): AgencySummaryFastPath | null {
  if (results.length === 0) return null;
  if (results.some((item) => item.result.success !== true)) return null;

  const deterministicResults = results.filter((item) =>
    DETERMINISTIC_ROUTE_AGENT_IDS.has(item.agentId)
  );
  if (deterministicResults.length !== 1) return null;

  const subtaskMap = new Map(cognitionResult.subtasks.map((task) => [task.id, task]));
  const nonDeterministic = results.filter(
    (item) => !DETERMINISTIC_ROUTE_AGENT_IDS.has(item.agentId)
  );

  for (const item of nonDeterministic) {
    const correspondingSubtask = subtaskMap.get(item.subtaskId);
    if (!ALLOWED_SYNTHESIS_AGENT_IDS.has(item.agentId)) {
      return null;
    }
    if (!correspondingSubtask) {
      return null;
    }
    if (!looksLikeSynthesisSubtask(correspondingSubtask.description)) {
      return null;
    }
  }

  const routeResult = deterministicResults[0];
  const routeSubtask =
    subtaskMap.get(routeResult.subtaskId) ??
    cognitionResult.subtasks.find((task) => task.agentId === routeResult.agentId);

  if (!routeSubtask) return null;

  const elapsedMs = results.reduce((sum, item) => sum + (item.result.durationMs ?? 0), 0);
  const summary =
    `Deterministic fast path: ${routeSubtask.description} ` +
    `completed via ${routeResult.agentId}` +
    (elapsedMs > 0 ? ` in ${elapsedMs}ms (subtask time).` : ".");

  return {
    summary,
    routeAgentId: routeResult.agentId,
  };
}

export function shouldSkipSynthesisSubtaskForDeterministicRoute(
  subtask: SubTask,
  completedResults: ExecutedSubtaskResult[]
): {
  skip: boolean;
  sourceSubtaskId?: string;
  sourceAgentId?: string;
} {
  const normalizedAgentId = subtask.agentId.trim().toLowerCase();
  if (normalizedAgentId !== "general" && normalizedAgentId !== "assistant") {
    return { skip: false };
  }
  if (!looksLikeSynthesisSubtask(subtask.description)) {
    return { skip: false };
  }
  if (!Array.isArray(subtask.dependencies) || subtask.dependencies.length === 0) {
    return { skip: false };
  }

  const dependencyResults = completedResults.filter((result) =>
    subtask.dependencies.includes(result.subtaskId)
  );
  if (dependencyResults.length === 0) {
    return { skip: false };
  }
  if (dependencyResults.some((result) => result.result.success !== true)) {
    return { skip: false };
  }

  const deterministicSource = dependencyResults.find((result) =>
    DETERMINISTIC_ROUTE_AGENT_IDS.has(result.agentId)
  );
  if (!deterministicSource) {
    return { skip: false };
  }

  return {
    skip: true,
    sourceSubtaskId: deterministicSource.subtaskId,
    sourceAgentId: deterministicSource.agentId,
  };
}

/**
 * Group subtasks into dependency levels for parallel execution.
 * Level 0 = no dependencies, Level 1 = depends only on level-0 tasks, etc.
 */
function topologicalGroup(subtasks: SubTask[]): SubTask[][] {
  if (subtasks.length === 0) return [];

  const taskMap = new Map(subtasks.map((st) => [st.id, st]));
  const levels: SubTask[][] = [];
  const assigned = new Set<string>();

  // Safety: limit iterations to prevent infinite loops on cyclic deps
  let iterations = 0;
  const maxIterations = subtasks.length;

  while (assigned.size < subtasks.length && iterations < maxIterations) {
    iterations++;
    const currentLevel: SubTask[] = [];

    for (const st of subtasks) {
      if (assigned.has(st.id)) continue;

      const depsResolved = st.dependencies.every(
        (dep) => assigned.has(dep) || !taskMap.has(dep)
      );

      if (depsResolved) {
        currentLevel.push(st);
      }
    }

    if (currentLevel.length === 0) {
      // Remaining tasks have unresolvable deps — push them all
      const remaining = subtasks.filter((st) => !assigned.has(st.id));
      levels.push(remaining);
      break;
    }

    for (const st of currentLevel) {
      assigned.add(st.id);
    }
    levels.push(currentLevel);
  }

  return levels;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function normalizeApiFetcherInput(
  input: unknown,
  routeId: string,
  description: string
): JsonRecord {
  const raw = asRecord(input);
  const params = asRecord(raw.params);
  const hasParams = Object.keys(params).length > 0;
  const fallbackParams: JsonRecord = { ...raw };
  delete fallbackParams.routeId;
  delete fallbackParams.params;
  delete fallbackParams.description;

  return {
    routeId:
      typeof raw.routeId === "string" && raw.routeId.trim().length > 0
        ? raw.routeId
        : routeId,
    params: hasParams ? params : fallbackParams,
    description:
      typeof raw.description === "string" && raw.description.length > 0
        ? raw.description
        : description,
  };
}

function buildAgencyFallbackInput(
  subtask: SubTask,
  extra?: Record<string, unknown>
): string {
  return JSON.stringify({
    taskDescription: subtask.description,
    input: subtask.input,
    agentId: subtask.agentId,
    ...(extra ?? {}),
  });
}

function resolveMaterializedSkillGuidance(subtask: SubTask): {
  candidateId?: string;
  capability?: string;
  skillFile: string;
  guidance: string;
} | null {
  const input = asRecord(subtask.input);
  if (input.useMaterializedSkill !== true) {
    return null;
  }

  const rawSkillFile =
    typeof input.suggestedSkillFile === "string"
      ? input.suggestedSkillFile.trim().replace(/\\/g, "/").replace(/^\.\//, "")
      : "";

  if (!rawSkillFile.startsWith("skills/learned/")) {
    return null;
  }

  if (!skillCandidatesStore.isMaterialized(rawSkillFile)) {
    return null;
  }

  const absoluteSkillFile = resolve(process.cwd(), rawSkillFile);
  if (!existsSync(absoluteSkillFile)) {
    return null;
  }

  const fileContents = readFileSync(absoluteSkillFile, "utf-8");
  const guidance =
    fileContents.length > 8_000
      ? `${fileContents.slice(0, 8_000)}\n\n[truncated]`
      : fileContents;

  return {
    candidateId:
      typeof input.candidateId === "string" ? input.candidateId : undefined,
    capability:
      typeof input.capability === "string" ? input.capability : undefined,
    skillFile: rawSkillFile,
    guidance,
  };
}

function isDeterministicSkillCreatorAgent(agentId: string): boolean {
  const normalized = agentId.trim().toLowerCase();
  return (
    normalized === "skill-creator" ||
    normalized === "skill_creator" ||
    normalized === "universal-skill-creator"
  );
}
