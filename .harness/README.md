# Eugene Krab Harness

This directory is the repo-local operating manual for Codex and other coding agents. `AGENTS.md` contains global rules; this file routes tasks to the smallest useful set of source-backed context, workflows, standards, and checks. Keep changing inventories and domain details out of the root file.

Repository: https://github.com/Flying-Henanese/eugene-krab

## Reading Order

1. Read `AGENTS.md` for global rules, then use this file to choose a task route.
2. Read only the files that match the task. Do not load every harness file by default.
3. Verify descriptions of current behavior against source and tests before editing.

For current behavior, use source and the relevant `context/` file. Historical
designs in `docs/superpowers/specs/` explain original rationale and scope;
consult them when revisiting those decisions, not as a routine prerequisite for
every Feishu or A-share change. Global repository rules remain in `AGENTS.md`.

## Task Routing

- Project orientation, ownership, and entrypoints: `context/project-overview.md`
- Runtime boundaries and module map: `context/architecture-map.md`
- Bun commands, environment variables, and local state: `context/runtime-and-config.md`
- Agent tools, skills, subagents, and tool registry behavior: `context/tools-skills-and-subagents.md`
- Feishu, WhatsApp, gateway routing, and chat channels: `context/gateway-and-channels.md`
- Financial data sources, A-share single-stock orchestration, neutral technical output, offline strategy research, and web-search pairing: `context/market-data-sources.md`
- For any code change: `checklists/code-change.md` before editing and
  `checklists/verification.md` before claiming completion. Use the matching
  `workflows/` file for a repeatable domain procedure.
- For a multi-step, resumable, or unusually risky code change: additionally use
  `loops/verified-code-change.md` and its persisted state. A small bounded edit
  can use the checklists directly without creating a loop state file.
- For a release: `workflows/release.md` and the global authorization rules in
  `AGENTS.md`.
- Credentials, file tools, gateway access, and data handling: `checklists/security.md`
- Coding conventions: `standards/coding.md`
- Known fixes and symptoms: `troubleshooting/`
- Multi-step execution plans: `plans/`
- Important validation/debug run notes: `runs/`

## Directory Roles

- `context/`: current project facts and mechanism notes. These files should cite concrete source paths and avoid speculative future design.
- `workflows/`: repeatable development procedures for common changes.
- `standards/`: local coding conventions. Keep `AGENTS.md` authoritative for global rules.
- `checklists/`: edit, test, review, and security checks.
- `troubleshooting/`: symptom-oriented debugging notes.
- `plans/`: active or completed multi-step implementation plans.
- `runs/`: concise records of meaningful verification or debugging sessions.
- `loops/`: reusable outer-loop specifications that coordinate context, workflows, checks, verification feedback, retry budgets, human gates, and named terminal states for coding agents.

## Maintenance Rules

- Distill from source; do not paste large README sections.
- Add a context file only when it answers a distinct class of future questions.
- When behavior changes, update the smallest affected current harness file and
  its index if needed. Preserve historical specs as design history.
- Keep examples free of real credentials and private user data.
