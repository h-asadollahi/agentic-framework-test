import type { LearnedRoute } from "../routing/learned-routes-schema.js";
import type { SubTask } from "../core/types.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function mergeInputWithDefaults(
  defaults: JsonRecord,
  input: JsonRecord
): JsonRecord {
  const merged: JsonRecord = {
    ...defaults,
    ...input,
  };

  const defaultArgs = asRecord(defaults.args);
  const inputArgs = asRecord(input.args);
  if (Object.keys(defaultArgs).length > 0 || Object.keys(inputArgs).length > 0) {
    merged.args = { ...defaultArgs, ...inputArgs };
  }

  if (typeof merged.routeId !== "string" || merged.routeId.trim().length === 0) {
    merged.routeId = typeof defaults.routeId === "string" ? defaults.routeId : "";
  }

  return merged;
}

/**
 * Apply learned-route defaults for registered sub-agents when route metadata
 * is available at execution time.
 */
export function hydrateRegisteredSubtaskInput(
  subtask: Pick<SubTask, "agentId" | "input">,
  route: LearnedRoute | null
): JsonRecord {
  const baseInput = asRecord(subtask.input);

  if (!route || route.routeType !== "sub-agent") {
    return baseInput;
  }

  if (!route.agentId || route.agentId !== subtask.agentId) {
    return baseInput;
  }

  const defaults = asRecord(route.agentInputDefaults);
  const merged = mergeInputWithDefaults(defaults, baseInput);
  if (typeof merged.routeId !== "string" || merged.routeId.length === 0) {
    merged.routeId = route.id;
  }

  return merged;
}
