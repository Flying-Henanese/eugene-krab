# Eugene Krab Harness

This directory is the repo-local operating manual for Codex and other coding agents. Keep `AGENTS.md` short and use this directory for source-backed project context, workflows, standards, decisions, troubleshooting, plans, and run notes.

## Reading Order

1. Read `AGENTS.md` first for repository rules and required commands.
2. Read this file to choose the relevant harness context.
3. Read only the files that match the task. Do not load every harness file by default.
4. Verify claims against source before changing code.

## Task Routing

- Project orientation, ownership, and entrypoints: `context/project-overview.md`
- Runtime boundaries and module map: `context/architecture-map.md`
- Bun commands, environment variables, and local state: `context/runtime-and-config.md`
- Agent tools, skills, subagents, and tool registry behavior: `context/tools-skills-and-subagents.md`
- Feishu, WhatsApp, gateway routing, and chat channels: `context/gateway-and-channels.md`
- Financial data sources, A-share single-stock orchestration, neutral technical output, offline strategy research, and web-search pairing: `context/market-data-sources.md`
- Before code changes: `checklists/code-change.md`
- Before claiming done: `checklists/verification.md`
- Credentials, file tools, gateway access, and data handling: `checklists/security.md`
- Common implementation flows: `workflows/`
- Current coding, testing, and review standards: `standards/`
- Known fixes and symptoms: `troubleshooting/`
- New design rationale and ADRs: `decisions/`
- Multi-step execution plans: `plans/`
- Important validation/debug run notes: `runs/`

## Directory Roles

- `context/`: current project facts and mechanism notes. These files should cite concrete source paths and avoid speculative future design.
- `workflows/`: repeatable development procedures for common changes.
- `standards/`: local coding, testing, and review expectations. Keep `AGENTS.md` authoritative for global rules.
- `checklists/`: operational checks used during edits and before completion.
- `decisions/`: architecture decision records and design indexes.
- `troubleshooting/`: symptom-oriented debugging notes.
- `plans/`: active or completed multi-step implementation plans.
- `runs/`: concise records of meaningful verification or debugging sessions.

## Maintenance Rules

- Distill from source; do not paste large README sections.
- Add a context file only when it answers a distinct class of future questions.
- When behavior changes, update the smallest affected harness file and any linked README/spec.
- Keep examples free of real credentials and private user data.
