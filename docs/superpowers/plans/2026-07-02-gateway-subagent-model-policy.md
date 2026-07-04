# Gateway and Subagent Model Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Feishu/gateway runs to use a configured premium main model, while delegated subagents default to a cheaper fast model such as `deepseek-v4-flash`.

**Architecture:** Keep CLI model selection unchanged. Add gateway/headless model resolution that prefers explicit request values, then gateway config/env defaults, then existing `.dexter/settings.json` fallback. Add subagent-local model resolution inside `spawn_subagent`, so the leader can run on Pro while isolated workers run on Flash unless overridden by type-specific env configuration.

**Tech Stack:** TypeScript, Bun test runner, LangChain tool wrappers, existing `providers.ts`/`model/llm.ts` provider metadata.

---

## File Structure

- Modify `src/gateway/config.ts`
  - Extend `gateway` config schema/type with optional default agent model fields.
  - Add a small helper to resolve gateway default model/provider from config, env, and existing settings.
- Modify `src/gateway/gateway.ts`
  - Use the new gateway model helper for WhatsApp and Feishu inbound handling.
  - Keep queued messages using the same resolved model as the active session.
- Modify `src/tools/subagent/spawn-subagent.ts`
  - Add exported `resolveSubagentModel(parentModel, typeKey)` helper.
  - Use `SUBAGENT_ANALYSIS_MODEL`, then `SUBAGENT_MODEL`, then provider `fastModel`, then parent model fallback.
  - Include the actual subagent model in the returned metadata line.
- Modify `env.example`
  - Document `DEXTER_AGENT_MODEL`, `DEXTER_AGENT_MODEL_PROVIDER`, `SUBAGENT_MODEL`, and `SUBAGENT_ANALYSIS_MODEL`.
- Add `src/tools/subagent/spawn-subagent.test.ts`
  - Unit-test subagent model resolution without calling LLMs.
- Modify `src/gateway/config.test.ts`
  - Unit-test gateway model/provider resolution from absent config, env, and JSON config.

## Design Decisions

- Environment variables are first-class for server deployments:
  - `DEXTER_AGENT_MODEL=deepseek-v4-pro`
  - `DEXTER_AGENT_MODEL_PROVIDER=deepseek`
  - `SUBAGENT_MODEL=deepseek-v4-flash`
  - `SUBAGENT_ANALYSIS_MODEL=deepseek-v4-pro` optional
- Gateway JSON config can also carry the same defaults:

```json
{
  "gateway": {
    "model": "deepseek-v4-pro",
    "modelProvider": "deepseek"
  }
}
```

- Resolution priority for gateway main agent:
  1. Explicit request value already provided by caller.
  2. `cfg.gateway.model` / `cfg.gateway.modelProvider`.
  3. `DEXTER_AGENT_MODEL` / `DEXTER_AGENT_MODEL_PROVIDER`.
  4. Existing `.dexter/settings.json` via `getSetting('modelId')` and `getSetting('provider')`.
  5. Hard fallback: `gpt-5.5` / `openai`.
- Resolution priority for subagents:
  1. `SUBAGENT_ANALYSIS_MODEL` when `typeKey === 'analysis'`.
  2. `SUBAGENT_MODEL` for all subagent types.
  3. `getFastModel(resolveProvider(parentModel).id, parentModel)`.
  4. Parent model fallback, already handled by `getFastModel`.

---

### Task 1: Add Gateway Main Model Resolution

**Files:**
- Modify: `src/gateway/config.ts`
- Modify: `src/gateway/config.test.ts`

- [ ] **Step 1: Write failing tests for gateway model resolution**

Add imports in `src/gateway/config.test.ts`:

```ts
import { loadGatewayConfig, resolveFeishuAccount, resolveGatewayAgentModel } from './config.js';
```

Add these tests inside the existing `describe('gateway config', () => { ... })` block:

```ts
test('resolves gateway agent model from env before settings fallback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
  const path = join(dir, 'missing.json');
  const oldModel = process.env.DEXTER_AGENT_MODEL;
  const oldProvider = process.env.DEXTER_AGENT_MODEL_PROVIDER;
  process.env.DEXTER_AGENT_MODEL = 'deepseek-v4-pro';
  process.env.DEXTER_AGENT_MODEL_PROVIDER = 'deepseek';
  try {
    const cfg = loadGatewayConfig(path);
    expect(resolveGatewayAgentModel(cfg)).toEqual({
      model: 'deepseek-v4-pro',
      modelProvider: 'deepseek',
    });
  } finally {
    if (oldModel === undefined) delete process.env.DEXTER_AGENT_MODEL;
    else process.env.DEXTER_AGENT_MODEL = oldModel;
    if (oldProvider === undefined) delete process.env.DEXTER_AGENT_MODEL_PROVIDER;
    else process.env.DEXTER_AGENT_MODEL_PROVIDER = oldProvider;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolves gateway agent model from gateway config before env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dexter-gateway-config-'));
  const path = join(dir, 'gateway.json');
  const oldModel = process.env.DEXTER_AGENT_MODEL;
  const oldProvider = process.env.DEXTER_AGENT_MODEL_PROVIDER;
  process.env.DEXTER_AGENT_MODEL = 'deepseek-v4-flash';
  process.env.DEXTER_AGENT_MODEL_PROVIDER = 'deepseek';
  try {
    writeFileSync(
      path,
      JSON.stringify({
        gateway: {
          model: 'deepseek-v4-pro',
          modelProvider: 'deepseek',
        },
      }),
      'utf8',
    );
    const cfg = loadGatewayConfig(path);
    expect(resolveGatewayAgentModel(cfg)).toEqual({
      model: 'deepseek-v4-pro',
      modelProvider: 'deepseek',
    });
  } finally {
    if (oldModel === undefined) delete process.env.DEXTER_AGENT_MODEL;
    else process.env.DEXTER_AGENT_MODEL = oldModel;
    if (oldProvider === undefined) delete process.env.DEXTER_AGENT_MODEL_PROVIDER;
    else process.env.DEXTER_AGENT_MODEL_PROVIDER = oldProvider;
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/gateway/config.test.ts
```

Expected: FAIL because `resolveGatewayAgentModel` is not exported.

- [ ] **Step 3: Extend gateway config schema and type**

In `src/gateway/config.ts`, add this import:

```ts
import { getSetting } from '../utils/config.js';
```

Extend the `gateway` zod object:

```ts
gateway: z
  .object({
    accountId: z.string().optional(),
    logLevel: z.enum(['silent', 'error', 'info', 'debug']).optional(),
    heartbeatSeconds: z.number().optional(),
    reconnect: ReconnectSchema.optional(),
    heartbeat: HeartbeatConfigSchema,
    model: z.string().optional(),
    modelProvider: z.string().optional(),
  })
  .optional(),
```

Extend the `GatewayConfig` type:

```ts
gateway: {
  accountId: string;
  logLevel: 'silent' | 'error' | 'info' | 'debug';
  heartbeatSeconds?: number;
  reconnect?: {
    initialMs?: number;
    maxMs?: number;
    factor?: number;
    jitter?: number;
    maxAttempts?: number;
  };
  model?: string;
  modelProvider?: string;
  heartbeat?: {
    enabled: boolean;
    intervalMinutes: number;
    activeHours?: { start: string; end: string; timezone?: string; daysOfWeek?: number[] };
    model?: string;
    modelProvider?: string;
    maxIterations: number;
  };
};
```

In the `loadGatewayConfig` return object, add:

```ts
model: parsed.gateway?.model,
modelProvider: parsed.gateway?.modelProvider,
```

inside the returned `gateway` object.

- [ ] **Step 4: Add the resolver helper**

Add this function near `loadGatewayConfig` in `src/gateway/config.ts`:

```ts
export function resolveGatewayAgentModel(
  cfg: GatewayConfig,
  explicit?: { model?: string; modelProvider?: string },
): { model: string; modelProvider: string } {
  return {
    model:
      explicit?.model ??
      cfg.gateway.model ??
      process.env.DEXTER_AGENT_MODEL ??
      (getSetting('modelId', 'gpt-5.5') as string),
    modelProvider:
      explicit?.modelProvider ??
      cfg.gateway.modelProvider ??
      process.env.DEXTER_AGENT_MODEL_PROVIDER ??
      (getSetting('provider', 'openai') as string),
  };
}
```

- [ ] **Step 5: Run gateway config tests**

Run:

```bash
bun test src/gateway/config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/gateway/config.ts src/gateway/config.test.ts
git commit -m "feat: add gateway agent model resolution"
```

---

### Task 2: Use Gateway Model Resolution for Feishu and WhatsApp

**Files:**
- Modify: `src/gateway/gateway.ts`

- [ ] **Step 1: Replace direct settings lookup in gateway inbound handlers**

In `src/gateway/gateway.ts`, update the config import to include the helper:

```ts
import { resolveGatewayAgentModel } from './config.js';
```

or merge it into the existing config import if present.

In `handleWhatsAppInbound`, replace:

```ts
const model = getSetting('modelId', 'gpt-5.5') as string;
const modelProvider = getSetting('provider', 'openai') as string;
```

with:

```ts
const { model, modelProvider } = resolveGatewayAgentModel(cfg);
```

In `handleFeishuInbound`, replace:

```ts
const model = getSetting('modelId', 'gpt-5.5') as string;
const modelProvider = getSetting('provider', 'openai') as string;
```

with:

```ts
const { model, modelProvider } = resolveGatewayAgentModel(cfg);
```

- [ ] **Step 2: Remove now-unused import**

If `src/gateway/gateway.ts` no longer uses `getSetting`, remove:

```ts
import { getSetting } from '../utils/config.js';
```

- [ ] **Step 3: Type-check**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run gateway tests**

Run:

```bash
bun test src/gateway/config.test.ts src/gateway/runtime.test.ts src/gateway/utils.test.ts
```

Expected: PASS. If `src/gateway/runtime.test.ts` does not exist in this branch, run the available gateway tests shown by `rg --files src/gateway | rg '\\.test\\.ts$'`.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/gateway/gateway.ts
git commit -m "feat: apply gateway model defaults to inbound agents"
```

---

### Task 3: Add Subagent Model Policy

**Files:**
- Modify: `src/tools/subagent/spawn-subagent.ts`
- Add: `src/tools/subagent/spawn-subagent.test.ts`

- [ ] **Step 1: Write failing tests for subagent model resolution**

Create `src/tools/subagent/spawn-subagent.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test';
import { resolveSubagentModel } from './spawn-subagent.js';

const originalSubagentModel = process.env.SUBAGENT_MODEL;
const originalAnalysisModel = process.env.SUBAGENT_ANALYSIS_MODEL;

afterEach(() => {
  if (originalSubagentModel === undefined) delete process.env.SUBAGENT_MODEL;
  else process.env.SUBAGENT_MODEL = originalSubagentModel;

  if (originalAnalysisModel === undefined) delete process.env.SUBAGENT_ANALYSIS_MODEL;
  else process.env.SUBAGENT_ANALYSIS_MODEL = originalAnalysisModel;
});

describe('resolveSubagentModel', () => {
  test('defaults DeepSeek subagents to provider fast model', () => {
    delete process.env.SUBAGENT_MODEL;
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('deepseek-v4-pro', 'research')).toBe('deepseek-v4-flash');
  });

  test('uses SUBAGENT_MODEL for all subagent types', () => {
    process.env.SUBAGENT_MODEL = 'deepseek-v4-flash';
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('deepseek-v4-pro', 'research')).toBe('deepseek-v4-flash');
    expect(resolveSubagentModel('deepseek-v4-pro', 'general-purpose')).toBe('deepseek-v4-flash');
  });

  test('uses SUBAGENT_ANALYSIS_MODEL for analysis subagents only', () => {
    process.env.SUBAGENT_MODEL = 'deepseek-v4-flash';
    process.env.SUBAGENT_ANALYSIS_MODEL = 'deepseek-v4-pro';

    expect(resolveSubagentModel('deepseek-v4-pro', 'analysis')).toBe('deepseek-v4-pro');
    expect(resolveSubagentModel('deepseek-v4-pro', 'research')).toBe('deepseek-v4-flash');
  });

  test('falls back to parent model when provider has no fast model', () => {
    delete process.env.SUBAGENT_MODEL;
    delete process.env.SUBAGENT_ANALYSIS_MODEL;

    expect(resolveSubagentModel('ollama:llama3.1', 'research')).toBe('ollama:llama3.1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test src/tools/subagent/spawn-subagent.test.ts
```

Expected: FAIL because `resolveSubagentModel` is not exported.

- [ ] **Step 3: Implement model resolver**

In `src/tools/subagent/spawn-subagent.ts`, add imports:

```ts
import { getFastModel } from '../../model/llm.js';
import { resolveProvider } from '../../providers.js';
```

Add this exported helper above `createSpawnSubagent`:

```ts
export function resolveSubagentModel(parentModel: string, typeKey: string): string {
  if (typeKey === 'analysis' && process.env.SUBAGENT_ANALYSIS_MODEL) {
    return process.env.SUBAGENT_ANALYSIS_MODEL;
  }

  if (process.env.SUBAGENT_MODEL) {
    return process.env.SUBAGENT_MODEL;
  }

  return getFastModel(resolveProvider(parentModel).id, parentModel);
}
```

- [ ] **Step 4: Use the resolver when creating subagents**

In `createSpawnSubagent`, after `const toolAllowlist = resolveSubagentTools(typeKey);`, add:

```ts
const subagentModel = resolveSubagentModel(model, typeKey);
```

Replace:

```ts
model,
```

inside `Agent.create({ ... })` with:

```ts
model: subagentModel,
```

- [ ] **Step 5: Include the actual worker model in the returned metadata**

Replace:

```ts
return usage
  ? `${answer}\n\n_[subagent ${typeKey}: ${usage.totalTokens} tokens]_`
  : answer;
```

with:

```ts
return usage
  ? `${answer}\n\n_[subagent ${typeKey}, ${subagentModel}: ${usage.totalTokens} tokens]_`
  : answer;
```

- [ ] **Step 6: Run subagent tests**

Run:

```bash
bun test src/tools/subagent/spawn-subagent.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run type-check**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/tools/subagent/spawn-subagent.ts src/tools/subagent/spawn-subagent.test.ts
git commit -m "feat: add configurable subagent model policy"
```

---

### Task 4: Document Runtime Configuration

**Files:**
- Modify: `env.example`

- [ ] **Step 1: Add model policy examples**

In `env.example`, after the LLM API key block and before Ollama, add:

```env
# Gateway/headless default model selection.
# Useful for Feishu/WhatsApp/cron services where the CLI /model command is not used.
DEXTER_AGENT_MODEL=deepseek-v4-pro
DEXTER_AGENT_MODEL_PROVIDER=deepseek

# Delegated subagent model policy.
# Defaults to each provider's fast model when unset, e.g. deepseek-v4-flash for DeepSeek.
SUBAGENT_MODEL=deepseek-v4-flash

# Optional: use a stronger model only for quantitative financial analysis subagents.
# SUBAGENT_ANALYSIS_MODEL=deepseek-v4-pro
```

- [ ] **Step 2: Run config-related tests**

Run:

```bash
bun test src/gateway/config.test.ts src/tools/subagent/spawn-subagent.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit Task 4**

```bash
git add env.example
git commit -m "docs: document gateway and subagent model config"
```

---

### Task 5: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
bun test src/gateway/config.test.ts src/tools/subagent/spawn-subagent.test.ts src/tools/registry.tushare.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Inspect diff**

Run:

```bash
git diff -- src/gateway/config.ts src/gateway/gateway.ts src/tools/subagent/spawn-subagent.ts src/tools/subagent/spawn-subagent.test.ts src/gateway/config.test.ts env.example
```

Expected:
- Gateway handlers use `resolveGatewayAgentModel(cfg)`.
- Subagent creation uses `subagentModel`.
- Env examples include main and subagent model settings.
- Tests cover env/config priority and subagent model policy.

- [ ] **Step 5: Optional manual smoke test for Feishu deployment config**

Set `.env`:

```env
DEXTER_AGENT_MODEL=deepseek-v4-pro
DEXTER_AGENT_MODEL_PROVIDER=deepseek
SUBAGENT_MODEL=deepseek-v4-flash
```

Start the gateway using the project's existing command. Send a Feishu prompt that encourages delegation:

```text
比较 AAPL、MSFT、NVDA 的财务质量和估值，必要时可以并行分析。
```

Expected:
- Main agent runs with `deepseek-v4-pro`.
- Any delegated subagent result footer shows `deepseek-v4-flash`, for example:

```text
_[subagent analysis, deepseek-v4-flash: 12345 tokens]_
```

- [ ] **Step 6: Final commit if verification changed anything**

If no files changed during verification, skip this step. If formatting/test updates changed files:

```bash
git add <changed-files>
git commit -m "test: verify gateway subagent model policy"
```

---

## Rollback Plan

If the policy causes runtime issues:

1. Remove `DEXTER_AGENT_MODEL`, `DEXTER_AGENT_MODEL_PROVIDER`, `SUBAGENT_MODEL`, and `SUBAGENT_ANALYSIS_MODEL` from `.env`.
2. Gateway falls back to `.dexter/settings.json` and existing defaults.
3. Subagents fall back to provider fast model. If that is the issue, set `SUBAGENT_MODEL` to the same model as the main agent.

## Acceptance Criteria

- Feishu and WhatsApp gateway runs can be configured without using CLI `/model`.
- `DEXTER_AGENT_MODEL=deepseek-v4-pro` makes gateway main agents use Pro.
- `SUBAGENT_MODEL=deepseek-v4-flash` makes delegated workers use Flash.
- `SUBAGENT_ANALYSIS_MODEL=deepseek-v4-pro` upgrades only `analysis` subagents when set.
- CLI behavior remains unchanged.
- Existing cron per-job `payload.model` remains respected.
- Tests and type-check pass.
