import { task, logger } from "@trigger.dev/sdk/v3";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agencyAgent } from "../agents/agency-agent.js";
import { subAgentRegistry } from "./sub-agents/registry.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { learnRouteTask } from "./learn-route.js";
import { resolveUnknownSubtaskStrategy } from "./execute-routing.js";
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
  materializeUniversalSkillFromSuggestion,
} from "./universal-skill-creator.js";
import { skillCandidatesStore } from "../routing/skill-candidates-store.js";
// Register all plugins on import
import "./sub-agents/plugins/index.js";
import type {
  AgencyResult,
  AgentResult,
  CognitionResult,
  ExecutionContext,
  SkillSuggestion,
  SubTask,
} from "../core/types.js";

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
    const { subtasks } = payload.cognitionResult;

    logger.info("Starting agency phase", {
      subtaskCount: subtasks.length,
      registeredAgents: subAgentRegistry.list().map((a) => a.id),
    });

    // ── Topological grouping ────────────────────────────────
    const levels = topologicalGroup(subtasks);

    const allResults: Array<{
      subtaskId: string;
      agentId: string;
      result: AgentResult;
    }> = [];

    for (const level of levels) {
      logger.info(`Running ${level.length} subtask(s) in parallel`);

      // Run all tasks in this level concurrently
      const levelResults = await Promise.allSettled(
        level.map(async (subtask) => {
          const startTime = Date.now();

          let result: AgentResult;

          if (isDeterministicSkillCreatorAgent(subtask.agentId)) {
            logger.info(
              `Using deterministic universal skill creator workflow for "${subtask.agentId}"`
            );
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
              : learnedRoutesStore.findByCapability(subtask.description);
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

            // Step 1: Check learned routes for a match
            const learnedRoute = learnedRoutesStore.findByCapability(
              subtask.description
            );

            const strategy = resolveUnknownSubtaskStrategy(
              subtask,
              Boolean(learnedRoute)
            );

            if (strategy === "use-learned-route" && learnedRoute) {
              // Use existing learned route target
              logger.info(`Found learned route "${learnedRoute.id}" for "${subtask.agentId}"`, {
                routeType: learnedRoute.routeType,
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
                    agentId: learnedRoute.agentId,
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

              const learnResult = await learnRouteTask.triggerAndWait({
                subtaskDescription: subtask.description,
                subtaskInput: subtask.input,
                agentId: subtask.agentId,
                runId: payload.context.sessionId,
                timeoutMinutes: 30,
              });

              if (
                learnResult.ok &&
                learnResult.output.learned &&
                learnResult.output.fetchResult
              ) {
                // Route learned and data fetched successfully
                result = learnResult.output.fetchResult;
              } else {
                // Step 3: Final fallback — use the Agency LLM agent
                logger.info(
                  "Route learning failed or timed out, falling back to LLM"
                );
                result = await agencyAgent.execute(
                  buildAgencyFallbackInput(subtask),
                  payload.context
                );
              }
            } else {
              logger.info(
                `Unknown subtask "${subtask.agentId}" is not data-oriented, using LLM fallback`
              );
              result = await agencyAgent.execute(
                buildAgencyFallbackInput(subtask),
                payload.context
              );
            }
          }

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

    let agencyResult: AgencyResult;
    const parsedSummary = parseAgentJson<AgencyResult>(summaryResult.output);
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

    const { suggestions, issue: suggestionIssue } =
      parseAgencySkillSuggestions(parsedSummary ?? null);
    if (suggestionIssue) {
      agencyResult.issues = [...(agencyResult.issues ?? []), suggestionIssue];
    }

    if (suggestions.length > 0) {
      agencyResult.skillSuggestions = suggestions;
      try {
        const { materializations, issues } =
          persistAndMaterializeSkillSuggestions(
            suggestions,
            payload.context
          );
        agencyResult.skillMaterializations = materializations;
        if (issues.length > 0) {
          agencyResult.issues = [...(agencyResult.issues ?? []), ...issues];
        }
        logger.info(`Persisted ${suggestions.length} skill suggestion(s)`, {
          suggestions: suggestions.map((item) => item.capability).slice(0, 5),
          materialized: materializations
            .filter((item) => item.success)
            .map((item) => `${item.capability}:${item.action}`)
            .slice(0, 5),
        });
      } catch (error) {
        logger.error("Failed to persist agency skill suggestions", {
          error: error instanceof Error ? error.message : String(error),
        });
        agencyResult.issues = [
          ...(agencyResult.issues ?? []),
          "Failed to persist agency skill suggestions for future cognition prompts.",
        ];
      }
    }

    return agencyResult;
  },
});

// ── Helpers ───────────────────────────────────────────────────

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

export function persistAndMaterializeSkillSuggestions(
  suggestions: SkillSuggestion[],
  context: ExecutionContext
): {
  materializations: NonNullable<AgencyResult["skillMaterializations"]>;
  issues: string[];
} {
  const materializations: NonNullable<AgencyResult["skillMaterializations"]> = [];
  const issues: string[] = [];

  for (const suggestion of suggestions) {
    const materialization = materializeUniversalSkillFromSuggestion(
      {
        capability: suggestion.capability,
        description: suggestion.description,
        suggestedSkillFile: suggestion.suggestedSkillFile,
        triggerPatterns: suggestion.triggerPatterns,
      },
      context,
      "autonomous"
    );

    const persisted = skillCandidatesStore.upsertCandidate({
      capability: suggestion.capability,
      description: suggestion.description,
      suggestedSkillFile: materialization.skillFile,
      triggerPatterns: suggestion.triggerPatterns,
      confidence: suggestion.confidence,
      requiresApproval: false,
      source: "autonomous",
    });

    materializations.push({
      candidateId: persisted.id,
      capability: suggestion.capability,
      skillFile: materialization.skillFile,
      action: materialization.action,
      success: materialization.success,
      reason: materialization.reason,
    });

    if (!materialization.success) {
      issues.push(
        `Autonomous skill materialization failed for ${suggestion.capability}: ${
          materialization.reason ?? "unknown error"
        }`
      );
    }
  }

  return { materializations, issues };
}
