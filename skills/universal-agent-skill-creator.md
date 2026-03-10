---
name: universal-agent-skill-creator
description: A model-agnostic guide for creating, testing, and iterating on AI agent skills (system prompts + tool definitions + domain knowledge) that work across Claude, GPT, Gemini, and other LLMs. Use when you want to build a reusable agent capability from scratch, improve an existing one, or benchmark performance across multiple providers.
---

# Universal Agent Skill Creator

A framework for creating AI agent skills that work across any LLM — Claude (Anthropic), GPT (OpenAI), Gemini (Google), and others.

## What is a "Skill" in this context?

In a vendor-specific world, a "skill" might be a proprietary file format tied to one platform. Here, a **skill** is a portable, structured package that turns a general-purpose LLM into a focused agent for a specific job. It consists of:

| Component | What it is | Universal format |
|-----------|-----------|-----------------|
| **System Prompt** | The core instructions — identity, domain knowledge, reasoning guidance, guardrails | Plain text / Markdown |
| **Tool Definitions** | What the agent can *do* — API calls, file operations, integrations | MCP servers or OpenAPI/function-calling schemas |
| **Domain Knowledge** | Static reference material the agent needs | Markdown files, JSON, or RAG-indexed documents |
| **Eval Suite** | Test cases to verify the skill works | JSON file with prompts, expected outputs, and assertions |
| **Skill Manifest** | Metadata: name, description, version, compatible models | YAML/JSON config file |

The key insight: every major LLM supports system prompts, tool/function calling, and context injection. The *format* differs slightly, but the *architecture* is the same. This guide teaches you to build the architecture once and adapt the format per provider.

---

## The Core Loop

At a high level, creating a skill follows this process:

1. Decide what the skill should do and roughly how it should do it
2. Write a draft (system prompt + tool definitions + reference knowledge)
3. Create test prompts and run them against one or more LLMs
4. Evaluate the results — qualitatively (does it feel right?) and quantitatively (did it meet the assertions?)
5. Rewrite the skill based on feedback
6. Repeat until satisfied
7. Expand the test set, try across multiple models, and finalize

Your job is to figure out where you are in this process and keep progressing through the stages. If you already have a draft, skip straight to eval/iterate. If you just want to vibe and iterate informally, that's fine too.

---

## Phase 1: Capture Intent

Start by understanding what the skill should accomplish. If the conversation already contains a workflow to capture (e.g., "turn what we just did into a reusable skill"), extract answers from context first.

**Four questions to answer:**

1. **What should this skill enable the agent to do?** Be specific — "help with customer support" is too vague; "triage incoming support tickets, classify by urgency, draft a response, and escalate to a human when confidence is below 70%" is actionable.

2. **When should this skill activate?** What user phrases, contexts, or triggers should invoke it? This becomes the skill description and/or routing logic.

3. **What's the expected output format?** Structured JSON? A drafted email? A file? A decision with reasoning?

4. **Which models should it support?** Pick your primary model for drafting, then decide which others to test against. Different models have different strengths — a skill that works well on Claude may need adjustments for GPT or Gemini.

5. **Should we set up test cases?** Skills with objectively verifiable outputs (data extraction, code generation, structured workflows) benefit enormously from test cases. Skills with subjective outputs (creative writing, conversation style) are better evaluated qualitatively. Decide upfront.

### Interview and Research

Proactively explore edge cases, input/output formats, example files, success criteria, and dependencies. Don't write test prompts until you've ironed this out. Come prepared with context to reduce burden on the user.

---

## Phase 2: Write the Skill

A skill is a folder with a standard structure:

```
skill-name/
├── manifest.yaml          # Metadata, description, model compatibility
├── system-prompt.md       # The core instructions (model-agnostic)
├── provider-adapters/     # Model-specific tweaks (optional)
│   ├── claude.md          # Claude-specific additions or overrides
│   ├── openai.md          # GPT-specific additions or overrides
│   └── gemini.md          # Gemini-specific additions or overrides
├── tools/                 # Tool definitions
│   ├── mcp-server/        # MCP server (if using MCP — works with Claude, and increasingly others)
│   └── openapi-schema.json# OpenAPI/function-calling schema (for OpenAI, Gemini, etc.)
├── knowledge/             # Domain knowledge files
│   ├── static/            # Curated, stable reference material
│   └── dynamic/           # Templates/instructions for runtime context retrieval
├── evals/                 # Test suite
│   └── evals.json
└── README.md              # Human-readable overview
```

### The Manifest

```yaml
name: ticket-triage-agent
version: 1.0.0
description: >
  Classifies incoming support tickets by urgency and category,
  drafts an initial response, and escalates to a human when
  confidence is below a threshold. Use whenever the user mentions
  ticket triage, support classification, helpdesk automation,
  or wants to automate first-response workflows.
author: Your Name
primary_model: claude-sonnet-4-20250514
tested_models:
  - claude-sonnet-4-20250514
  - gpt-4o
  - gemini-2.5-pro
requires_tools: true
mcp_servers:
  - name: helpdesk-mcp
    url: https://your-mcp-server.example.com/mcp
```

### The System Prompt

This is the heart of the skill. It should be written in plain Markdown and be **model-agnostic by default** — no references to "Claude", "GPT", or "Gemini" in the core instructions. Provider-specific tweaks go in the `provider-adapters/` folder.

**Structure your system prompt around four dimensions** (inspired by the Identity–Cognition–Agency–Interface framework):

```markdown
# [Skill Name]

## Identity & Grounding
Who this agent is, what voice/tone it uses, what domain it operates in.

### Personality
- Consistent voice and communication style
- Preferences and defaults

### Domain Knowledge
- What the agent knows (reference the knowledge/ folder)
- How to retrieve dynamic context at runtime

### Memory
- What to retain across interactions (if applicable)
- How to learn from past successes and failures

## Cognition
How the agent thinks — between receiving input and producing output.

### Planning
- How to decompose high-level goals into sub-tasks
- How to sequence and adapt plans

### Judgement
- Values: what principles guide decisions
- Rules: non-negotiable guidelines
- Expectations: what "good" looks like for specific tasks

### Guardrails
- What the agent should NEVER do
- Boundaries of autonomy
- When to stop and ask a human

## Agency
How the agent acts — tools, autonomy, and workflows.

### Tools
- Available tools and how to use them
- Tool chaining patterns (output of one feeds input of next)

### Autonomy
- Decision-making scope (what it can do without asking)
- Error recovery procedures
- Scheduling and recurring behaviors (if applicable)

## Output Format
Exactly what the agent should produce and how to structure it.

### Examples
Show concrete input → output pairs.
```

### Writing Style Tips

These principles work across all LLMs:

- **Explain the "why"** behind every instruction. Modern LLMs are smart — when they understand *why* something matters, they follow it more reliably than when given rigid rules without context.

- **Avoid heavy-handed ALWAYS/NEVER in all-caps** unless it's genuinely critical. Instead, explain the reasoning and trust the model to internalize it. Think of it as onboarding a smart new hire, not programming a machine.

- **Use examples liberally.** Input/output pairs are the most effective way to communicate expectations across any model.

- **Be specific about edge cases.** Vague instructions produce vague results. "Handle errors gracefully" means nothing; "When the API returns a 429, wait 5 seconds and retry up to 3 times, then inform the user" is actionable.

- **Keep it under 4000 words** for the core system prompt. If you need more, split into reference files that the agent loads on demand. Every major model has context limits, and bloated prompts degrade performance.

- **Test readability.** If a human can't follow your system prompt, neither can the model.

### Provider Adapters (Optional)

Sometimes models need slightly different phrasing or structure to perform well. Put these tweaks in `provider-adapters/`:

```markdown
# Claude-specific Adapter

## Additional instructions
- When using MCP tools, prefer chaining multiple tool calls in a single turn.
- Use XML tags for structured output when precision matters.

## System prompt additions
Append to the end of the base system prompt:
"When uncertain between two approaches, explain both and let the user choose."
```

```markdown
# OpenAI-specific Adapter

## Additional instructions
- Use function calling with strict JSON schemas for structured output.
- When parallel function calling is available, batch independent tool calls.

## System prompt modifications
Replace the Output Format section with OpenAI's structured output format:
{ "type": "json_schema", "schema": { ... } }
```

The goal is to keep the core system prompt 95%+ shared across models, with adapters handling the 5% of provider-specific differences.

---

## Phase 3: Define Tools

Tools are what give your agent the ability to *act*. There are two main approaches, and they're increasingly converging:

### Option A: MCP (Model Context Protocol)

MCP is becoming the cross-model standard for tool integration. It works natively with Claude and is gaining adoption across other providers. If you're building tools that should work everywhere, MCP is the recommended path.

An MCP server exposes tools via a standardized protocol. Each tool has a name, description, input schema, and output format. See the MCP Builder guide for implementation details.

**Advantages:** Single implementation works across multiple models. Growing ecosystem. Standardized error handling and authentication.

### Option B: Provider-Native Function Calling

Each provider has its own function/tool calling format:

**OpenAI:**
```json
{
  "type": "function",
  "function": {
    "name": "classify_ticket",
    "description": "Classify a support ticket by urgency and category",
    "parameters": {
      "type": "object",
      "properties": {
        "ticket_text": { "type": "string", "description": "The ticket content" },
        "customer_tier": { "type": "string", "enum": ["free", "pro", "enterprise"] }
      },
      "required": ["ticket_text"]
    }
  }
}
```

**Google Gemini:**
```json
{
  "function_declarations": [{
    "name": "classify_ticket",
    "description": "Classify a support ticket by urgency and category",
    "parameters": {
      "type": "object",
      "properties": {
        "ticket_text": { "type": "string", "description": "The ticket content" },
        "customer_tier": { "type": "string", "enum": ["free", "pro", "enterprise"] }
      },
      "required": ["ticket_text"]
    }
  }]
}
```

**Claude (native tool use):**
```json
{
  "name": "classify_ticket",
  "description": "Classify a support ticket by urgency and category",
  "input_schema": {
    "type": "object",
    "properties": {
      "ticket_text": { "type": "string", "description": "The ticket content" },
      "customer_tier": { "type": "string", "enum": ["free", "pro", "enterprise"] }
    },
    "required": ["ticket_text"]
  }
}
```

Notice how similar these are. The `tools/` folder in your skill can contain a canonical schema and a simple adapter script that reformats it for each provider.

### Tool Design Principles (Universal)

- **Descriptive names:** `classify_support_ticket` not `process`
- **Clear descriptions:** The model chooses tools based on descriptions — make them unambiguous
- **Constrained inputs:** Use enums, required fields, and type constraints to prevent misuse
- **Actionable errors:** Return error messages that tell the model what to do next, not just what went wrong
- **Idempotent where possible:** The model may retry — make sure repeated calls don't cause problems

---

## Phase 4: Test and Evaluate

### Write Test Cases

Create 3-5 realistic test prompts — the kind of thing a real user would actually say. Save them to `evals/evals.json`:

```json
{
  "skill_name": "ticket-triage-agent",
  "evals": [
    {
      "id": 1,
      "prompt": "Hey, I just got an email from a customer saying their dashboard has been loading slowly for 3 days and they're on our enterprise plan. Can you triage this?",
      "expected_output": "High urgency classification, performance category, drafted response acknowledging the issue with a specific timeline",
      "assertions": [
        {
          "name": "urgency_is_high",
          "check": "Output classifies the ticket as high urgency",
          "type": "semantic"
        },
        {
          "name": "category_is_performance",
          "check": "Output categorizes as performance/reliability",
          "type": "semantic"
        },
        {
          "name": "response_includes_timeline",
          "check": "Drafted response includes a specific follow-up timeline",
          "type": "semantic"
        },
        {
          "name": "enterprise_acknowledged",
          "check": "Enterprise tier is acknowledged and influences priority",
          "type": "semantic"
        }
      ],
      "files": []
    }
  ]
}
```

**Assertion types:**

- `exact` — String match (for structured outputs)
- `contains` — Output contains a specific substring
- `regex` — Output matches a pattern
- `semantic` — Requires human or LLM-as-judge evaluation (most common for agent skills)
- `programmatic` — Run a script against the output

### Run Tests Across Models

The key advantage of a model-agnostic skill is that you can test across providers. Here's a simple test runner pattern:

```python
# test_runner.py — conceptual, adapt to your setup
import json

PROVIDERS = {
    "claude": {
        "api_url": "https://api.anthropic.com/v1/messages",
        "model": "claude-sonnet-4-20250514",
        "format_request": format_claude_request,
    },
    "openai": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-4o",
        "format_request": format_openai_request,
    },
    "gemini": {
        "api_url": "https://generativelanguage.googleapis.com/v1beta/models/...",
        "model": "gemini-2.5-pro",
        "format_request": format_gemini_request,
    },
}

def run_eval(skill_path, eval_path, providers=["claude"]):
    skill = load_skill(skill_path)
    evals = json.load(open(eval_path))

    results = {}
    for provider_name in providers:
        provider = PROVIDERS[provider_name]
        system_prompt = build_system_prompt(skill, provider_name)
        tools = build_tools(skill, provider_name)

        results[provider_name] = []
        for eval_case in evals["evals"]:
            response = call_provider(
                provider, system_prompt, tools, eval_case["prompt"]
            )
            results[provider_name].append({
                "eval_id": eval_case["id"],
                "prompt": eval_case["prompt"],
                "output": response,
                "assertions": eval_case.get("assertions", []),
            })

    return results
```

### Organize Results

```
skill-name-workspace/
├── iteration-1/
│   ├── eval-1-ticket-triage-enterprise/
│   │   ├── claude/
│   │   │   ├── output.md
│   │   │   ├── timing.json
│   │   │   └── grading.json
│   │   ├── openai/
│   │   │   ├── output.md
│   │   │   ├── timing.json
│   │   │   └── grading.json
│   │   └── eval_metadata.json
│   ├── eval-2-ticket-triage-billing/
│   │   └── ...
│   └── benchmark.json
├── iteration-2/
│   └── ...
```

### Grade Results

For each test case and provider:

1. **Programmatic assertions** — run scripts against the output (fast, reliable, reusable)
2. **Semantic assertions** — use an LLM-as-judge (send the output + assertion to a model and ask "does this output satisfy the assertion? Yes/No + evidence")
3. **Human review** — present outputs side by side and ask for feedback

Save grading results:

```json
{
  "eval_id": 1,
  "provider": "claude",
  "expectations": [
    {
      "text": "urgency_is_high",
      "passed": true,
      "evidence": "Output explicitly states 'Priority: High' and explains the 3-day duration and enterprise tier as factors"
    },
    {
      "text": "response_includes_timeline",
      "passed": false,
      "evidence": "Response acknowledges the issue but says 'we'll look into it' without a specific timeline"
    }
  ]
}
```

### Cross-Model Comparison

One of the most valuable things about model-agnostic skills is comparing outputs across providers. After running tests, look for:

- **Consistency:** Do all models produce the same classification/decision? If not, your instructions may be ambiguous.
- **Strengths:** Which model handles edge cases best? Which follows tool-calling patterns most reliably?
- **Failures:** If a model fails an assertion, is it a model problem or a prompt problem? If *multiple* models fail, it's almost certainly a prompt problem.
- **Cost/Speed:** Track tokens and latency per provider to make informed tradeoffs.

---

## Phase 5: Improve the Skill

This is the heart of the loop. You've run tests, reviewed results, and now you need to make the skill better.

### How to Think About Improvements

1. **Generalize from the feedback.** You're iterating on a few examples to move fast, but the skill needs to work across many prompts. Rather than overfitting to specific test cases with rigid rules, try different framings, metaphors, or structural approaches. It's cheap to experiment.

2. **Keep the prompt lean.** Remove instructions that aren't pulling their weight. If the model is wasting time on unproductive steps, cut the instructions that cause them.

3. **Explain the why.** Modern LLMs have strong theory of mind. When you explain *why* something matters, they perform better than when given rigid rules. If you're writing ALWAYS or NEVER in all-caps, try reframing as reasoning instead.

4. **Look for repeated patterns across test runs.** If every test case results in the model doing the same multi-step workaround, that's a signal to build that pattern into the skill directly.

5. **Cross-model failures are prompt failures.** If Claude, GPT, and Gemini all struggle with the same assertion, the problem is your instructions, not the models. Fix the prompt first.

6. **Model-specific failures may need adapters.** If only one model struggles, consider adding a provider adapter rather than changing the core prompt (which could regress other models).

### The Iteration Loop

1. Apply improvements to the skill
2. Rerun all test cases (across all target models)
3. Compare with previous iteration
4. Ask for human feedback
5. Repeat until satisfied

Keep going until:
- The user is happy
- All assertions pass across target models
- You're not making meaningful progress

---

## Phase 6: Package and Distribute

Once the skill is finalized, package it for distribution:

```bash
# Create a distributable archive
cd skill-name/
tar -czf skill-name-v1.0.0.tar.gz \
  manifest.yaml \
  system-prompt.md \
  provider-adapters/ \
  tools/ \
  knowledge/ \
  evals/ \
  README.md
```

Include a README that explains:
- What the skill does
- Which models it's been tested on (with pass rates)
- How to deploy it (system prompt injection, tool registration, etc.)
- Any dependencies (MCP servers, API keys, external services)

---

## Diagnostic Guide: When Things Break

Agent problems are almost never intelligence problems. They're structural problems. Each one maps to a specific part of the skill:

| Symptom | Likely cause | Where to fix |
|---------|-------------|--------------|
| Agent gives inconsistent or off-brand answers | Identity section is vague or missing | `system-prompt.md` → Identity & Grounding |
| Agent doesn't know something it should | Knowledge exists but isn't connected | `knowledge/` folder or context retrieval instructions |
| Agent does something dumb despite having the right info | Judgement criteria or guardrails aren't explicit enough | `system-prompt.md` → Cognition |
| Agent can't complete a task end to end | Missing tools or tool-chaining instructions | `tools/` folder and Agency section |
| Agent only works when explicitly poked | No autonomy or scheduling instructions | `system-prompt.md` → Agency → Autonomy |
| Agent does the right thing but you don't trust it | Missing observability — no explanation of reasoning | `system-prompt.md` → Output Format (add reasoning traces) |
| Works on Claude but fails on GPT (or vice versa) | Provider-specific behavior difference | `provider-adapters/` |
| Works on all models but fails on specific edge cases | Test coverage gap | `evals/evals.json` — add the edge case |

When something feels off, don't start from scratch. Ask: *which dimension is broken?*

---

## Model-Specific Notes

### Claude (Anthropic)
- Supports MCP natively — preferred tool integration method
- XML tags in system prompts can improve structured output precision
- Tends to be cautious — if the agent is too conservative, adjust guardrails
- Supports extended thinking for complex reasoning tasks
- System prompt goes in the `system` parameter (not as a user message)

### GPT (OpenAI)
- Function calling is mature and reliable
- Supports structured outputs with JSON schema enforcement
- System messages go in the `messages` array with `role: "system"`
- Parallel function calling available — batch independent tool calls
- Tends to be verbose — you may need explicit "be concise" instructions

### Gemini (Google)
- Supports function calling with `function_declarations`
- System instructions go in `system_instruction` parameter
- Grounding with Google Search available as a built-in tool
- Strong on multimodal tasks (images, video, audio)
- Code execution available as a built-in tool

### General Tips Across Models
- All models benefit from clear examples (few-shot prompting)
- All models struggle with vague instructions — be specific
- Token costs vary significantly — track usage per provider
- Temperature settings affect consistency — lower for deterministic tasks, higher for creative ones
- Test with the *cheapest* model first to iterate fast, then validate on your target model

---

## Quick Reference: The Framework at a Glance

| Dimension | Core question | What to build |
|-----------|--------------|--------------|
| **Identity & Grounding** | What does the agent know? | System prompt (personality, domain knowledge references, memory instructions) |
| **Cognition** | How does the agent think? | System prompt (planning instructions, judgement criteria, guardrails) |
| **Agency** | How does the agent act? | Tool definitions (MCP or function calling), autonomy rules |
| **Interface** | How does the agent interact? | Output format, escalation rules, observability/reasoning traces |
| **Evaluation** | How do we know it works? | Eval suite (test prompts, assertions, cross-model benchmarks) |

---

## Think of It as a Tiny Company

If the framework above feels abstract, picture your skill as a tiny company with a single employee — a brilliant generalist who showed up to an empty office.

- **Identity & Grounding** is the onboarding — the culture doc, the wiki, the notebook. *Here's who you are, here's what we know, here's what we've learned.*
- **Cognition** is the work at the desk — the employee reads the brief, makes a plan, exercises judgement, and knows what lines not to cross.
- **Agency** is the tools and initiative — the software on the laptop, the badge that opens doors, and the alarm clock that says *check in every morning without being asked.*
- **Interface** is the office door — how the employee communicates with you, when to knock and ask, and the glass wall that lets you watch the work happen when you need to.
- **Evaluation** is the performance review — did they do the job well? Across different clients (models)? Consistently?

The model is the employee. The skill is the company you build around them. And like any company, the bottleneck is almost never the talent — it's the infrastructure.

Good luck building.
