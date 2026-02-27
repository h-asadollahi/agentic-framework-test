import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { tasks, runs } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { logger } from "./core/logger.js";
import { shortTermMemory } from "./memory/short-term.js";
import { longTermMemory } from "./memory/long-term.js";
import { subAgentRegistry } from "./trigger/sub-agents/registry.js";
// Register all sub-agent plugins
import "./trigger/sub-agents/plugins/index.js";

const app = new Hono();

// ── Middleware ────────────────────────────────────────────────
app.use("*", cors());

// ── Health Check ─────────────────────────────────────────────
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    agents: subAgentRegistry.getSummary().length,
    sessions: shortTermMemory.sessionCount(),
    memory: longTermMemory.stats(),
  });
});

// ── Send Message ─────────────────────────────────────────────
const MessageSchema = z.object({
  userMessage: z.string().min(1, "Message is required"),
  sessionId: z.string().optional(),
});

app.post("/message", async (c) => {
  const body = await c.req.json();
  const parsed = MessageSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { userMessage, sessionId = crypto.randomUUID() } = parsed.data;

  // Store the user message in short-term memory
  shortTermMemory.addMessage(sessionId, {
    role: "user",
    content: userMessage,
  });

  logger.info("Message received", {
    sessionId,
    messageLength: userMessage.length,
  });

  try {
    // Trigger the pipeline via trigger.dev
    const handle = await tasks.trigger("orchestrate-pipeline", {
      userMessage,
      sessionId,
    });

    return c.json({
      runId: handle.id,
      sessionId,
      status: "triggered",
      message: "Pipeline started. Use GET /status/:runId to track progress.",
    });
  } catch (error) {
    logger.error("Failed to trigger pipeline", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: "Failed to start pipeline", details: String(error) },
      500
    );
  }
});

// ── Get Run Status ───────────────────────────────────────────
app.get("/status/:runId", async (c) => {
  const runId = c.req.param("runId");

  try {
    const run = await runs.retrieve(runId);

    return c.json({
      runId: run.id,
      status: run.status,
      output: run.output,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt,
    });
  } catch (error) {
    return c.json(
      { error: "Run not found", details: String(error) },
      404
    );
  }
});

// ── Session History ──────────────────────────────────────────
app.get("/session/:sessionId/history", (c) => {
  const sessionId = c.req.param("sessionId");

  if (!shortTermMemory.has(sessionId)) {
    return c.json({ error: "Session not found" }, 404);
  }

  const history = shortTermMemory.getRecentHistory(sessionId, 50);
  return c.json({ sessionId, messages: history });
});

// ── Clear Session ────────────────────────────────────────────
app.delete("/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  shortTermMemory.clear(sessionId);
  return c.json({ sessionId, cleared: true });
});

// ── List Registered Sub-Agents ───────────────────────────────
app.get("/agents", (c) => {
  return c.json({ agents: subAgentRegistry.getSummary() });
});

// ── Memory Stats ─────────────────────────────────────────────
app.get("/memory/stats", (c) => {
  return c.json({
    shortTerm: {
      activeSessions: shortTermMemory.sessionCount(),
    },
    longTerm: longTermMemory.stats(),
  });
});

// ── Start Server ─────────────────────────────────────────────
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, () => {
  logger.info(`Server running on http://localhost:${port}`);
  logger.info(`Registered sub-agents: ${subAgentRegistry.getSummary().map((a) => a.id).join(", ") || "none"}`);
});

export default app;
