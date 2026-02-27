import { task, logger } from "@trigger.dev/sdk/v3";
import { agencyAgent } from "../agents/agency-agent.js";
import { subAgentRegistry } from "./sub-agents/registry.js";
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
            // ── Registered sub-agent plugin ───────────────
            result = await subAgentRegistry.execute(
              subtask.agentId,
              subtask.input,
              payload.context
            );
          } else {
            // ── Fallback: use the Agency LLM agent ────────
            logger.info(
              `No registered sub-agent for "${subtask.agentId}", falling back to LLM`
            );
            const llmInput = JSON.stringify({
              taskDescription: subtask.description,
              input: subtask.input,
              agentId: subtask.agentId,
            });
            result = await agencyAgent.execute(llmInput, payload.context);
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
    try {
      agencyResult = JSON.parse(summaryResult.output as string);
      // Ensure our actual results are included
      agencyResult.results = allResults;
    } catch {
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
