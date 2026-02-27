import { task, logger } from "@trigger.dev/sdk/v3";
import { agencyAgent } from "../agents/agency-agent.js";
import type {
  AgencyResult,
  CognitionResult,
  ExecutionContext,
} from "../core/types.js";

/**
 * Execute Task (Agency)
 *
 * Third stage of the guardrail pipeline.
 * Executes the subtask plan produced by cognition.
 *
 * In a full implementation, this would use batch.triggerByTaskAndWait()
 * to run sub-agents in parallel. For now, it passes the plan to the
 * Agency agent for analysis and summarization.
 *
 * When sub-agent plugins are registered (Phase 5), this task will:
 * 1. Resolve each subtask's agentId to a trigger.dev task
 * 2. Run independent subtasks in parallel via batch
 * 3. Run dependent subtasks in topological order
 * 4. Aggregate results
 */
export const executeTask = task({
  id: "pipeline-execute",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    cognitionResult: CognitionResult;
    context: ExecutionContext;
  }) => {
    logger.info("Starting agency phase", {
      subtaskCount: payload.cognitionResult.subtasks.length,
    });

    // For now, pass the plan to the agency agent for analysis
    // In Phase 5, this will trigger actual sub-agent tasks
    const input = JSON.stringify({
      plan: payload.cognitionResult.plan,
      subtasks: payload.cognitionResult.subtasks,
      reasoning: payload.cognitionResult.reasoning,
    });

    const result = await agencyAgent.execute(input, payload.context);

    logger.info("Agency phase complete", {
      model: result.modelUsed,
      tokens: result.tokensUsed,
    });

    let agencyResult: AgencyResult;
    try {
      agencyResult = JSON.parse(result.output as string);
    } catch {
      logger.warn("Agency agent output wasn't valid JSON, creating default result");
      agencyResult = {
        results: payload.cognitionResult.subtasks.map((st) => ({
          subtaskId: st.id,
          agentId: st.agentId,
          result: {
            success: true,
            output: result.output,
            modelUsed: result.modelUsed,
          },
        })),
        summary: result.output as string,
      };
    }

    return agencyResult;
  },
});
