# dynamic-workflow-from-scratch

A from-scratch, **runnable** reimplementation of Claude Code's *dynamic workflows*: an
LLM-authored (or hand-written) JavaScript program that orchestrates many subagents, runs in a
`node:vm` sandbox, and resumes from a **prefix-chained journaled** cache.

It depends only on a model API — **no code-agent runtime required**. `agent()` is the single
backend-bound primitive, behind a pluggable `Executor`.

```bash
npm i
npm run demo:mock     # a real 5-agent fan-out workflow, 0 tokens (deterministic mock)
npm run demo:resume   # edit one step, resume — watch the cascade (upstream cached, downstream re-runs)
npm run demo          # the same workflow on a real model (needs .env, see below)
```

## What it reimplements

When a task is too big for one agent's single pass, you fan out to many. But coordinating many
agents pollutes the coordinator's context, isn't resumable, and the control flow lives in the
model's head. Dynamic workflows answer this: the orchestration is a **program** (loop / branch /
fan-out / reduce live in script variables, not the context window); only the final `return`
comes back. Every `agent()` result is **journaled**, so a re-run resumes from the longest
unchanged prefix.

## The DSL

A workflow is plain JavaScript with a `meta` literal and a few injected globals:

```js
export const meta = { name: 'review', description: 'review changes, then verify', phases: [{ title: 'Review' }] }

phase('Review')
const findings = await parallel(            // BARRIER: wait for all
  CHANGES.map((c) => () => agent(`Review: ${c}`, { schema: FINDING_SCHEMA })),
)
const verified = await pipeline(            // NO barrier: each item streams independently
  findings, (f) => agent(`Verify: ${f.title}`),
)
return verified                              // only this reaches the caller's context
```

| primitive | what it does |
|---|---|
| `agent(prompt, opts?)` | the only token-spending primitive; `opts.schema` forces structured output |
| `parallel(thunks)` | barrier; async reject → `null`, **a synchronous throw propagates** |
| `pipeline(items, ...stages)` | no barrier; each item independent; a stage throw drops that item to `null` |
| `phase` / `log` | progress + narration (cosmetic — not in the cache key) |
| `args` / `budget` | run input / token accounting |

## How it works

- **Sandbox + determinism guard** (`src/sandbox.ts`) — `node:vm` with only the DSL + a curated
  allowlist injected; the system clock and RNG throw. This is a **determinism** boundary so
  replay is sound, **not** a security boundary (see [SECURITY.md](./SECURITY.md)).
- **Prefix-chained journal** (`src/journal.ts`) — each `agent()`'s cache key folds the running
  digest of all prior calls, synchronously before any `await`. Editing call *N* invalidates *N*
  and everything downstream; upstream stays a 0-token hit. The key also folds the **backend
  fingerprint**, so a real run never serves a mock run's cached results.
- **Pluggable executor** (`src/executor/`) — `MockBackend` (0-token, deterministic) and
  `AnthropicBackend` (forced structured output via `tool_choice`, ajv validation, retry). Any
  Anthropic-compatible endpoint works via a custom `baseURL`.
- **Reserve-at-slot budget** (`src/budget.ts`) — reserves an estimate when a slot is acquired and
  reconciles on return, so concurrent in-flight agents can't all overshoot the ceiling.

## Real backend

`npm run demo` reads a gitignored `.env`:

```
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_BASE_URL=https://api.anthropic.com   # or any Anthropic-compatible endpoint
DWF_MODEL=claude-sonnet-4-6                     # any model your endpoint serves
```

## Layout

```
src/  types · loader · sandbox · primitives · scheduler · journal · resume · schema · budget · runner · executor/{mock,anthropic}
bin/run.ts          CLI: dwf <workflow.js> [--mock] [--resume <runId>]
examples/           runnable workflow scripts
scripts/            demo drivers
test/               vitest (run: npm test) — fully offline via the mock backend
```

## License

MIT
