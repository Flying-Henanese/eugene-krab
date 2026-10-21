# Repository Guidelines

Eugene Krab is a Bun/TypeScript financial-research agent with CLI, chat-gateway,
and China A-share capabilities. The upstream project is
https://github.com/virattt/dexter.

## Start Here

- For nontrivial repository work, read `.harness/README.md` and follow its task
  routing. Read only the context, workflow, standard, or checklist needed for the
  current task.
- Inspect the relevant source and tests before treating harness notes as a
  description of current behavior. Historical design specs explain earlier
  decisions; `.harness/README.md` routes to the current working context.
- Check `git status --short` before editing and preserve unrelated user changes.

## Global Rules

- Use Bun for project commands. The essential checks are `bun run typecheck`
  and `bun test`; select focused checks through
  `.harness/checklists/verification.md`.
- Use TypeScript ESM and strict typing. Follow `.harness/standards/coding.md`
  for module-specific conventions. Do not add logging unless asked or needed by
  an existing diagnostic path.
- Never commit or expose `.env`, real credentials, or private `.dexter/` runtime
  state. Use `.harness/checklists/security.md` for sensitive changes.
- Update relevant harness context when behavior changes; avoid unrelated
  documentation. Consult `.harness/checklists/code-change.md` before editing
  and `.harness/checklists/verification.md` before claiming completion.
- Do not commit, push, tag, release, publish, or deploy without user authorization.
  Authorization already given for the action in the conversation remains valid.

The detailed project map, commands, provider and tool policies, domain-specific
boundaries, and release procedure live in `.harness/` so they are loaded only
when relevant.
