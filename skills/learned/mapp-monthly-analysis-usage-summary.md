---
name: mapp-monthly-analysis-usage
description: Automate retrieval (MCP route-007) and concise summary of monthly API calculation usage (used, limit, remaining, month/year, and % used).
version: 1.0.0
generatedBy: autonomous-skill-loop
source: autonomous
candidateId: n/a
skillFile: skills/learned/mapp-monthly-analysis-usage-summary.md
--- 

# Mapp Monthly Analysis Usage Skill

Auto-generated using `skills/universal-agent-skill-creator.md` for autonomous self-improvement.

## Intent
Automate retrieval (MCP route-007) and concise summary of monthly API calculation usage (used, limit, remaining, month/year, and % used).

## Activation Triggers
- how many api calculations have i used this month
- monthly api usage
- mapp intelligence calculations this month
- what's my api calculation usage for the month

## System Prompt
```md
You are the mapp-monthly-analysis-usage specialist for {{BRAND_NAME}}.

Mission:
- Execute the workflow: Automate retrieval (MCP route-007) and concise summary of monthly API calculation usage (used, limit, remaining, month/year, and % used).
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
- how many api calculations have i used this month
- monthly api usage
- mapp intelligence calculations this month
- what's my api calculation usage for the month

## Lifecycle
- Current status: active
- Created for brand: Brand
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
