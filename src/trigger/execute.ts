import { task, logger } from "@trigger.dev/sdk/v3";
import { agencyAgent } from "../agents/agency-agent.js";
import { subAgentRegistry } from "./sub-agents/registry.js";
import { learnedRoutesStore } from "../routing/learned-routes-store.js";
import { learnRouteTask } from "./learn-route.js";
import { resolveUnknownSubtaskStrategy } from "./execute-routing.js";
import { parseAgentJson } from "./agent-output-parser.js";
import { hydrateRegisteredSubtaskInput } from "./learned-route-input-hydration.js";
import {
  buildMcpBuilderAgentResult,
  isMcpBuilderIntent,
} from "./mcp-builder.js";
import {
  buildUniversalSkillCreatorAgentResult,
  isUniversalSkillCreationIntent,
} from "./universal-skill-creator.js";
// Register all plugins on import
import "./sub-agents/plugins/index.js";
import type {
  AgencyResult,
  AgentResult,
  CognitionResult,
  ExecutionContext,
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

          if (subAgentRegistry.has(subtask.agentId)) {
            const routeIdFromInput =
              typeof subtask.input?.routeId === "string"
                ? subtask.input.routeId
                : null;
            const learnedRoute = routeIdFromInput
              ? learnedRoutesStore.getById(routeIdFromInput)
              : learnedRoutesStore.findByCapability(subtask.description);
            const hydratedInput = hydrateRegisteredSubtaskInput(
              subtask,
              learnedRoute
            );

            // ── Registered sub-agent plugin ───────────────
            result = await subAgentRegistry.execute(
              subtask.agentId,
              hydratedInput,
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
                  learnedRoutesStore.incrementUsage(learnedRoute.id);
                } else {
                  logger.warn(
                    `Learned route "${learnedRoute.id}" points to unknown sub-agent "${learnedRoute.agentId}", falling back to LLM`
                  );
                  const llmInput = JSON.stringify({
                    taskDescription: subtask.description,
                    input: subtask.input,
                    agentId: subtask.agentId,
                  });
                  result = await agencyAgent.execute(llmInput, payload.context);
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
                const llmInput = JSON.stringify({
                  taskDescription: subtask.description,
                  input: subtask.input,
                  agentId: subtask.agentId,
                });
                result = await agencyAgent.execute(
                  llmInput,
                  payload.context
                );
              }
            } else {
              logger.info(
                `Unknown subtask "${subtask.agentId}" is not data-oriented, using LLM fallback`
              );
              const llmInput = JSON.stringify({
                taskDescription: subtask.description,
                input: subtask.input,
                agentId: subtask.agentId,
              });
              result = await agencyAgent.execute(
                llmInput,
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
