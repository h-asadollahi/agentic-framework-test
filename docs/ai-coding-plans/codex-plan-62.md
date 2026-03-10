# Plan 62 — Fix Trigger.dev CLI Version Mismatch

## Goal
Fix `npm run trigger:dev` failing with `Invalid Version: ^4.4.1` by aligning project scripts with Trigger.dev CLI v4.

## Steps
1. Update npm scripts in `package.json`:
- `trigger:login` from `npx trigger.dev@3 ...` to `npx trigger.dev@4.4.3 ...`
- `trigger:dev` from `npx trigger.dev@3 ...` to `npx trigger.dev@4.4.3 ...`

2. Validate CLI command resolution:
- Run `npx trigger.dev@4.4.3 --version` to confirm v4 CLI works in this environment.

3. Update handover:
- Add a short note about the v3→v4 script fix and why the error happened.

4. Commit and push:
- Commit only the version-mismatch fix artifacts.
