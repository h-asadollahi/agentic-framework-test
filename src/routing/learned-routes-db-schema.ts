import {
  boolean,
  integer,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const learnedRoutesTable = pgTable("learned_routes", {
  id: text("id").primaryKey(),
  capability: text("capability").notNull(),
  description: text("description").notNull(),
  audience: text("audience").notNull().default("marketer"),
  scope: text("scope").notNull().default("global"),
  brandId: text("brand_id"),
  matchPatterns: jsonb("match_patterns").$type<string[]>().notNull(),
  routeType: text("route_type").notNull(),
  endpoint: jsonb("endpoint").$type<Record<string, unknown> | null>(),
  apiWorkflow: jsonb("api_workflow").$type<Record<string, unknown> | null>(),
  agentId: text("agent_id"),
  agentInputDefaults: jsonb("agent_input_defaults")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  inputMapping: jsonb("input_mapping")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  outputFormat: text("output_format").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  addedBy: text("added_by").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learnedRouteEventsTable = pgTable("learned_route_events", {
  id: serial("id").primaryKey(),
  routeId: text("route_id"),
  eventType: text("event_type").notNull(),
  runId: text("run_id"),
  sessionId: text("session_id"),
  audience: text("audience").notNull().default("marketer"),
  scope: text("scope").notNull().default("global"),
  brandId: text("brand_id"),
  agentId: text("agent_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const slackHitlThreadsTable = pgTable(
  "slack_hitl_threads",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    messageTs: text("message_ts").notNull(),
    threadTs: text("thread_ts").notNull(),
    status: text("status").notNull().default("sent"),
    audience: text("audience").notNull().default("admin"),
    scope: text("scope").notNull().default("global"),
    brandId: text("brand_id"),
    taskDescription: text("task_description"),
    reason: text("reason"),
    severity: text("severity"),
    runId: text("run_id"),
    sessionId: text("session_id"),
    agentId: text("agent_id"),
    routeId: text("route_id"),
    respondedBy: text("responded_by"),
    responseText: text("response_text"),
    addedRouteId: text("added_route_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    threadTsUnique: uniqueIndex("slack_hitl_threads_thread_ts_key").on(table.threadTs),
    channelCreatedAtIdx: index("slack_hitl_threads_channel_created_at_idx").on(
      table.channel,
      table.createdAt
    ),
    kindCreatedAtIdx: index("slack_hitl_threads_kind_created_at_idx").on(
      table.kind,
      table.createdAt
    ),
  })
);

export const brandsTable = pgTable(
  "brands",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    brandIdentity: jsonb("brand_identity")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    guardrails: jsonb("guardrails")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    channelRules: jsonb("channel_rules")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: uniqueIndex("brands_name_key").on(table.name),
  })
);

export const llmUsageEventsTable = pgTable(
  "llm_usage_events",
  {
    id: serial("id").primaryKey(),
    pipelineRunId: text("pipeline_run_id"),
    audience: text("audience").notNull(),
    scope: text("scope").notNull(),
    brandId: text("brand_id"),
    source: text("source").notNull(),
    sessionId: text("session_id").notNull(),
    runId: text("run_id").notNull(),
    componentKind: text("component_kind").notNull(),
    componentId: text("component_id").notNull(),
    modelAlias: text("model_alias").notNull(),
    resolvedModelId: text("resolved_model_id").notNull(),
    provider: text("provider").notNull(),
    tokensUsed: integer("tokens_used").notNull().default(0),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    audienceCreatedAtIdx: index("llm_usage_events_audience_created_at_idx").on(
      table.audience,
      table.createdAt
    ),
    brandCreatedAtIdx: index("llm_usage_events_brand_created_at_idx").on(
      table.brandId,
      table.createdAt
    ),
    pipelineRunIdx: index("llm_usage_events_pipeline_run_id_idx").on(
      table.pipelineRunId
    ),
    runIdx: index("llm_usage_events_run_id_idx").on(table.runId),
  })
);

export const llmPromptUsageRunsTable = pgTable(
  "llm_prompt_usage_runs",
  {
    id: serial("id").primaryKey(),
    pipelineRunId: text("pipeline_run_id").notNull(),
    audience: text("audience").notNull(),
    scope: text("scope").notNull(),
    brandId: text("brand_id"),
    source: text("source").notNull(),
    sessionId: text("session_id").notNull(),
    userPrompt: text("user_prompt").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    llmCallCount: integer("llm_call_count").notNull().default(0),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pipelineRunIdx: uniqueIndex("llm_prompt_usage_runs_pipeline_run_id_key").on(
      table.pipelineRunId
    ),
    audienceStartedAtIdx: index("llm_prompt_usage_runs_audience_started_at_idx").on(
      table.audience,
      table.startedAt
    ),
    brandStartedAtIdx: index("llm_prompt_usage_runs_brand_started_at_idx").on(
      table.brandId,
      table.startedAt
    ),
  })
);

export const agentAuditRunsTable = pgTable(
  "agent_audit_runs",
  {
    pipelineRunId: text("pipeline_run_id").primaryKey(),
    sessionId: text("session_id").notNull(),
    audience: text("audience").notNull(),
    scope: text("scope").notNull(),
    brandId: text("brand_id"),
    source: text("source").notNull(),
    userPrompt: text("user_prompt").notNull(),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    totalEvents: integer("total_events").notNull().default(0),
    totalErrors: integer("total_errors").notNull().default(0),
    totalWarnings: integer("total_warnings").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    audienceStartedAtIdx: index("agent_audit_runs_audience_started_at_idx").on(
      table.audience,
      table.startedAt
    ),
    brandStartedAtIdx: index("agent_audit_runs_brand_started_at_idx").on(
      table.brandId,
      table.startedAt
    ),
    statusStartedAtIdx: index("agent_audit_runs_status_started_at_idx").on(
      table.status,
      table.startedAt
    ),
  })
);

export const agentAuditEventsTable = pgTable(
  "agent_audit_events",
  {
    id: serial("id").primaryKey(),
    pipelineRunId: text("pipeline_run_id").notNull(),
    runId: text("run_id"),
    sessionId: text("session_id").notNull(),
    phase: text("phase").notNull(),
    componentKind: text("component_kind").notNull(),
    componentId: text("component_id").notNull(),
    eventType: text("event_type").notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status"),
    modelAlias: text("model_alias"),
    resolvedModelId: text("resolved_model_id"),
    provider: text("provider"),
    durationMs: integer("duration_ms"),
    tokensUsed: integer("tokens_used"),
    brandId: text("brand_id"),
    audience: text("audience").notNull(),
    scope: text("scope").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pipelineSequenceIdx: index("agent_audit_events_pipeline_sequence_idx").on(
      table.pipelineRunId,
      table.sequence
    ),
    phaseCreatedAtIdx: index("agent_audit_events_phase_created_at_idx").on(
      table.phase,
      table.createdAt
    ),
    componentCreatedAtIdx: index("agent_audit_events_component_created_at_idx").on(
      table.componentKind,
      table.componentId,
      table.createdAt
    ),
    statusCreatedAtIdx: index("agent_audit_events_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
  })
);
