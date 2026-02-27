title: Multi-Agent Marketing Platform — Full Pipeline
order: Marketer, API Server, Trigger.dev, Orchestrator, Grounding, Cognition, Agency, Sub-Agent Registry, Sub-Agent Plugin, Agency LLM, Interface, Notify Task, Channel Registry, Slack, Email, Webhook, Escalation, Human

=: **Main Pipeline Flow**

note:
Marketer sends a message, the pipeline processes it
through 4 guardrail stages, and returns a formatted
response with optional notifications.

Marketer -> API Server: POST /message { userMessage, sessionId }
note API Server:
Validates input via **Zod** schema.
Stores message in **Short-Term Memory**.
Generates sessionId if not provided.
API Server -> Trigger.dev: tasks.trigger("orchestrate-pipeline")
API Server -> Marketer: { runId, sessionId, status: "triggered" }
note Marketer:
Can poll **GET /status/:runId** for real-time updates.
Trigger.dev -> Orchestrator: Run task: **orchestrate-pipeline**

-: **Stage 1/4 — Grounding**

Orchestrator -> Grounding: triggerAndWait({ userMessage, sessionId })
note Grounding:
Reads **soul.md** and **guardrails.md**
via knowledge tools to establish
brand context and constraints.
Grounding -> Grounding: buildExecutionContext(sessionId)
Grounding -> Grounding: groundingAgent.execute() with model fallback
Grounding -> Orchestrator: GroundingResult { brandIdentity, guardrails, context }
note Orchestrator:
trace.push({ phase: "grounding", durationMs })

-: **Stage 2/4 — Cognition**

Orchestrator -> Cognition: triggerAndWait({ userMessage, groundingResult })
note Cognition:
Pure reasoning — no tools.
Decomposes the request into
an executable subtask plan.
Cognition -> Cognition: cognitionAgent.execute() with model fallback
Cognition -> Orchestrator: CognitionResult { subtasks[], reasoning, plan }
note Orchestrator:
trace.push({ phase: "cognition", action: "Decomposed into N subtasks" })

-: **Stage 3/4 — Agency (Parallel Execution)**

Orchestrator -> Agency: triggerAndWait({ cognitionResult, context })
note Agency:
Groups subtasks by dependency level
(topological sort) and executes
each level in parallel.
Agency -> Agency: topologicalGroup(subtasks) into levels

group: **For each dependency level — parallel execution**
Agency -> Sub-Agent Registry: has(subtask.agentId)?
if: Registered plugin found
Sub-Agent Registry -> Sub-Agent Plugin: registry.execute(agentId, input, context)
note Sub-Agent Plugin:
Validates input via **Zod** schema.
Runs generateText() with model fallback.
Sub-Agent Plugin -> Sub-Agent Registry: AgentResult { success, output, modelUsed }
Sub-Agent Registry -> Agency: AgentResult
else: No registered plugin — LLM fallback
Agency -> Agency LLM: agencyAgent.execute({ taskDescription, input })
note Agency LLM:
Falls back to the Agency LLM agent
for unknown agentIds.
Agency LLM -> Agency: AgentResult
end
end

Agency -> Agency LLM: Summarise all sub-agent results
Agency LLM -> Agency: summary
Agency -> Orchestrator: AgencyResult { results[], summary }
note Orchestrator:
trace.push({ phase: "agency", action: summary })

-: **Stage 4/4 — Interface**

Orchestrator -> Interface: triggerAndWait({ agencyResult, context })
note Interface:
Formats the response in brand voice.
Determines if notifications are needed.
Interface -> Interface: interfaceAgent.execute() with model fallback
Interface -> Orchestrator: DeliveryResult { formattedResponse, notifications[] }
note Orchestrator:
trace.push({ phase: "interface" })

-: **Notifications (Fire-and-Forget)**

if: notifications.length > 0
Orchestrator -> Notify Task: trigger({ notification }) — *fire-and-forget*
Notify Task -> Channel Registry: get(notification.channel)
if: channel = "slack"
Channel Registry -> Slack: slackChannel.send() via @slack/web-api
Slack -> Channel Registry: { success, messageId }
else: channel = "email"
Channel Registry -> Email: emailChannel.send() via SendGrid
Email -> Channel Registry: { success, messageId }
else: channel = "webhook"
Channel Registry -> Webhook: webhookChannel.send() via fetch + HMAC
Webhook -> Channel Registry: { success, messageId }
end
end

-: **Pipeline Complete**

Orchestrator -> Trigger.dev: PipelineResult { formattedResponse, notifications, trace }
note:
Marketer polls **GET /status/:runId** which calls
runs.retrieve(runId) to get the completed output.
Marketer -> API Server: GET /status/:runId
API Server -> Trigger.dev: runs.retrieve(runId)
Trigger.dev -> API Server: { status, output, timestamps }
API Server -> Marketer: PipelineResult { formattedResponse, trace }

=: **Human-in-the-Loop Escalation (Alternate Flow)**

note:
When an agent encounters a situation
requiring human judgment, it triggers
the escalation task.
Agency -> Escalation: triggerAndWait({ escalation, timeoutHours })
Escalation -> Notify Task: trigger({ slack notification })
Escalation -> Notify Task: trigger({ email notification })
Notify Task -> Slack: Alert: "Action Required"
Notify Task -> Email: Alert to admin
Escalation -> Escalation: wait.createToken({ timeout: "24h", tags })
...: **Task paused — waiting for human decision**
Human -> Trigger.dev: wait.completeToken(token, { approved, decision })
Trigger.dev -> Escalation: Resume with human decision
Escalation -> Agency: EscalationResult { approved, decision, timedOut: false }

=: **Other API Endpoints**

Marketer -> API Server: GET /health
API Server -> Marketer: { status, agents, sessions, memory }
Marketer -> API Server: GET /session/:id/history
API Server -> Marketer: { messages[] } from Short-Term Memory
Marketer -> API Server: GET /agents
API Server -> Marketer: Sub-Agent Registry summary
Marketer -> API Server: GET /memory/stats
API Server -> Marketer: { shortTerm, longTerm } stats
