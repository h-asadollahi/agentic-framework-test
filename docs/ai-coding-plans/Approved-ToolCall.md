
Plan

Approved Tool Execution Layer for This Project
Summary
Yes, it is possible for this project to support ChatGPT/Claude-style tool execution. For this codebase, the recommended version is approved tool execution, not unrestricted shell access.

Why this is feasible here:

The project already has a model-tool execution seam in base-agent.ts and base-sub-agent.ts, both of which call generateText(... tools ...).
It already supports external tool systems via MCP in mcp-client.ts.
It already has structured audit logging for tool calls and sub-agent execution.
Recommended architecture choice:

Phase 1: add app-controlled, schema-defined tools and script wrappers
Do not start with “model can run arbitrary bash/python commands”
Optional later: add a sandboxed executor as a separate, tightly controlled advanced layer
Key Changes
1. Add a first-class approved-tool layer
Introduce a deterministic tool registry for actions the model is allowed to invoke.

Tool categories:

internal report/query scripts
controlled data transforms
CSV/JSON validators and normalizers
repo-local operational utilities
external systems via MCP or HTTP wrappers
Design:

each tool has:
id
description
input schema
execution handler
timeout
audience/scope restrictions
approval policy
tools should accept structured arguments, not free-form shell strings
tools should return structured output for downstream reasoning and auditability
Recommended runtime shape:

main agents and sub-agents continue using AI SDK tools
most new “on-the-fly” actions are exposed as tool definitions or deterministic sub-agent helpers
if a task is stable and repeated, promote it into a deterministic capability instead of repeatedly invoking an LLM to decide how to call it
2. Prefer wrapped scripts, not arbitrary command execution
If the user wants “run Python/bash like ChatGPT/Claude,” implement it as wrapped, approved scripts.

Recommended pattern:

create curated wrappers around specific scripts or commands
expose those wrappers as tools
the model chooses the tool and fills structured arguments
the application, not the model, decides the actual command line
Example shape:

run_mapp_report_template
normalize_marketing_export
validate_segment_payload
generate_cohort_rollup
What not to allow in v1:

raw shell command strings from the model
arbitrary filesystem traversal
arbitrary package installation
unrestricted Python execution in the API/worker process
3. Keep human control explicit
Approved tools should respect the project’s existing trust-boundary model.

Policy rules:

low-risk read-only tools can run automatically
high-risk or side-effectful tools require admin approval or marketer approval depending on scope
destructive or environment-changing tools are out of scope for v1
every tool call must be audit-visible, including:
requested tool
arguments
caller agent/sub-agent
result / error
whether HITL was required
This fits the current project direction better than provider-native “computer use,” because the control plane stays inside your application.

4. Use MCP for external systems, local tools for repo/runtime work
Split the responsibilities cleanly:

Use MCP when:

the tool is really an external business/data capability
the capability belongs to another service
you want provider-agnostic access to business tools
Use local approved tools when:

the action is repo-local
the action runs a local script
the action transforms files/data under your control
the action needs strong local audit/policy enforcement
This project already has the right foundation for both.

5. Treat full shell/Python sandboxing as a separate Phase 2
A ChatGPT/Claude-code-agent style runtime is also possible, but it should be isolated behind a dedicated sandbox service.

If you ever add it, the safe version should include:

separate worker/runtime, not the main API process
ephemeral filesystem/workdir
command allowlists or profile-based restrictions
network policy controls
resource limits: CPU, memory, duration, file size
explicit admin-only or approval-gated access
full audit trail of command, stdout/stderr, exit code, artifacts
Recommendation:

do not make this the default path for marketer-facing requests
use it only for advanced internal/admin workflows after the approved-tool layer proves insufficient
Important Interfaces / Types
Internal additions:

ApprovedToolSpec
ToolExecutionPolicy
ToolExecutionResult
ToolExecutionContext
ToolApprovalRequirement
Likely integration points:

tool registry near the current agent/sub-agent tool layer
policy checks integrated with autonomy / HITL logic
audit event types extended for tool-run lifecycle if needed
optional new deterministic sub-agent such as script-runner or ops-tool-runner
No marketer-facing public API change is required for v1.

Test Plan
Tool registration and execution
approved tools register with schema, metadata, and policy
valid structured inputs execute correctly
invalid inputs fail deterministically
Policy enforcement
read-only tools can run without approval when allowed
restricted tools trigger the correct HITL path
blocked tools are rejected before execution
Auditability
tool call requests and results appear in the audit trail
arguments and outputs are sanitized correctly
failures/timeouts are recorded clearly
Safety
model cannot inject arbitrary shell into a wrapped-script tool
tools cannot escape allowed inputs/paths
timeouts and execution errors fail safely
End-to-end scenarios
marketer analytics request uses approved deterministic tools/MCP correctly
admin operational request can invoke an allowed internal tool
repeated stable workflows can be promoted from LLM-decided tool use into deterministic capabilities
Assumptions and Defaults
Recommended default is approved structured tools, not arbitrary shell access.
MCP remains the preferred path for external business/data capabilities.
Local script/tool execution should be app-controlled and audited, not delegated directly to provider-native “computer use.”
Full sandboxed shell/Python execution is possible, but should be a separate advanced phase with stronger controls.
The project’s multi-provider design is better served by app-owned tools than by leaning heavily on provider-specific built-in tools.
Research Basis
OpenAI Responses supports built-in tools and function calling, including extending model capabilities with tools:
https://platform.openai.com/docs/api-reference/responses/community-forums
https://platform.openai.com/docs/guides/function-calling/how-do-i-ensure-the-model-calls-the-correct-function
Anthropic supports tool use and also documents a bash tool for shell execution:
https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/token-efficient-tool-use
https://docs.anthropic.com/fr/docs/agents-and-tools/tool-use/bash-tool
This repo already uses AI SDK tools and MCP as execution primitives in:
base-agent.ts
base-sub-agent.ts
mcp-client.ts
