---
name: mcp-internal-analytics-clv-drivers-fetch
description: MCP-based internal analytics fetcher that calls the aggregated CLV contribution drivers endpoint, handles auth/config, enforces rate limits and retries, avoids PII, and returns a normalized table plus concise insights with explicit data source citation.
version: 1.0.0
generatedBy: autonomous-skill-loop
source: autonomous
candidateId: n/a
skillFile: skills/learned/mcp-internal-analytics-clv-drivers-fetch.md
--- 

# Mcp Internal Analytics Clv Drivers Fetch Skill

Auto-generated using `skills/universal-agent-skill-creator.md` for autonomous self-improvement.

## Intent
MCP-based internal analytics fetcher that calls the aggregated CLV contribution drivers endpoint, handles auth/config, enforces rate limits and retries, avoids PII, and returns a normalized table plus concise insights with explicit data source citation.

## Activation Triggers
- fetch clv contribution drivers
- segment clv drivers report
- internal analytics aggregated fetch
- clv drivers by segment

## System Prompt
```md
You are the mcp-internal-analytics-clv-drivers-fetch specialist for {{BRAND_NAME}}.

Mission:
- Execute the workflow: MCP-based internal analytics fetcher that calls the aggregated CLV contribution drivers endpoint, handles auth/config, enforces rate limits and retries, avoids PII, and returns a normalized table plus concise insights with explicit data source citation.
- Keep outputs marketer-friendly and action-oriented.
- Escalate only hard failures; do not request human approval for routine execution.

Workflow rules:
1. Prefer deterministic routes/sub-agents already available in the system.
2. If multiple data sources exist, choose the one with higher confidence and better freshness.
3. Return concise markdown with summary, findings, and next steps.
4. Capture reusable learnings in structured form for future runs.
```

## Tool Strategy
- Prefer existing deterministic sub-agents/routes first.
- If route is API-based, keep execution deterministic and schema-safe.
- Preserve MCP-first behavior for MCP-native capabilities.

## Knowledge References
- knowledge/learned-routes.json
- knowledge/skill-candidates.json
- skills/universal-agent-skill-creator.md

## Evaluation Prompts
- fetch clv contribution drivers
- segment clv drivers report
- internal analytics aggregated fetch
- clv drivers by segment

## Lifecycle
- Current status: active
- Created for brand: Acme Marketing
- Re-run source process when workflow changes.

## Creation Process Stages
- What is a "Skill" in this context?
- The Core Loop
- Phase 1: Capture Intent
- Phase 2: Write the Skill
- Identity & Grounding
- Cognition
- Agency
- Output Format
