import {
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
    taskDescription: text("task_description"),
    reason: text("reason"),
    severity: text("severity"),
    runId: text("run_id"),
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
