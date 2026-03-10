import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
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

