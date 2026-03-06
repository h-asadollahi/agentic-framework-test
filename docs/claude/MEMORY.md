# Project Memory

## User Preferences
- **Plans go to `./docs/`**: Whenever a plan is created, save it to the `./docs` folder AND push to the remote git repo
- **Git workflow**: Push plans/docs to remote before starting implementation
- **Phase explanations go to `./docs/`**: For each implementation phase, save the chat explanation to `./docs/` and push to git

## Project: Multi-Agent Marketing Platform
- **Repo**: `git@github.com:h-asadollahi/agentic-framework-test.git` (branch: main)
- **Stack**: Trigger.dev (orchestration) + Vercel AI SDK v6 (AI layer) + TypeScript
- **Architecture**: 4 guardrail agents (Grounding, Cognition, Agency, Interface) in sequential pipeline, with parallel sub-agent execution via trigger.dev batch
- **Plan doc**: `docs/implementation-plan.md`
- **Article reference**: https://productized.tech/writing/building-ai-agents-the-ai-is-the-easy-part
