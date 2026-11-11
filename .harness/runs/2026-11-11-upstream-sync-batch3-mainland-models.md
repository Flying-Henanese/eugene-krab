# Upstream sync: mainland model subset

User scope: this fork uses mainland Chinese models; skip GPT and Anthropic
adaptation. This batch selectively ports the DeepSeek/Moonshot parts of
`2ceb4fc` and `1f9f429`. It remains uncommitted alongside batch 2.

## Changes

- Add `deepseek-flash` and `kimi-k3` to model selection; retain older IDs and GLM.
- Set provider fast-model defaults to DeepSeek Flash and Kimi K3. Existing
  `SUBAGENT_MODEL` and analysis-specific overrides still win.
- Recognize the DeepSeek Flash alias as a thinking model and preserve explicit
  provider selection, configured effort, and existing mainland endpoints.
- Fix a pre-existing DeepSeek parameter forwarding issue. HTTP-request tests
  showed that constructor-level `reasoning_effort` and `extraBody` were omitted
  by the installed LangChain adapter, including for the older DeepSeek models.
  Send `reasoning_effort` and `thinking` through `modelKwargs`, matching the
  adapter's actual request serialization path.

Do not auto-migrate saved model IDs. Keep Moonshot's conservative 131072-token
provider-wide context limit while older Kimi choices remain supported. Do not
port foreign-provider model lists, defaults, context-window increases, or the
Anthropic/LangChain dependency bumps. Existing foreign-provider code is retained.
Gateway/cron resolution and local GLM reasoning-content replay remain intact.

Official model references checked on 2026-11-11:

- [DeepSeek API introduction](https://api-docs.deepseek.com/en/)
- [Kimi K3 official announcement](https://www.kimi.com/en/blog/kimi-k3)

## Verification

- `bun run typecheck`: passed.
- Focused `bun test --isolate` covering mainland models, existing LLM adapters,
  subagent overrides and Gateway configuration: 35 passed across 4 files.
- Full `bun test --isolate`: 563 passed, 0 failed, 1357 assertions across 73 files.
- `git diff --check`: passed.

Tests ran in a temporary copy containing both batch 2 and batch 3 without
private `.env` or `.dexter/` state. New request tests inspect serialized HTTP
bodies using a fake fetch; they make no live model calls. The original stash
`92ac10e819d0367cb745423e87072ad32890a7e7` remains unchanged and unapplied.
No commits, dependency installations, pushes, or deployments occurred in batch 3.
