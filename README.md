# dynamic-workflow-from-scratch

A from-scratch, **runnable** reimplementation of Claude Code's *dynamic workflows*: an
LLM-authored (or hand-written) JavaScript program that orchestrates many subagents, runs
in a `node:vm` sandbox, and resumes from a **prefix-chained journaled** cache.

The engine depends only on a model API — **no code-agent runtime required**. `agent()` is
the single backend-bound primitive, behind a pluggable `Executor`:

- **`MockExecutor`** — 0-token, deterministic. Powers offline/CI runs and the resume tests.
- **`AnthropicExecutor`** — the real leaf: a direct Messages API call with forced structured output.

Headline feature: **correct prefix-chained journaled resume** — edit the *N*-th `agent()` call
and only it and everything downstream re-run; everything before it is a 0-token cache hit.

As a capstone, the engine ships as an **OpenCode plugin**, so its leaf agents can borrow
OpenCode's real coding tools.

## Quickstart

```bash
npm i
npm run demo:mock                 # runs a real fan-out workflow, 0 tokens
ANTHROPIC_API_KEY=… npm run demo  # runs it for real
```

## Status

🚧 Building in the open, test-first. The DSL (`agent` / `parallel` / `pipeline` / `phase` /
`log` / `budget`), the `node:vm` sandbox with a determinism guard, the journal, and resume
are landing module by module — each commit keeps `npm test` green.

> Note: `node:vm` here is a **determinism** boundary (so replay is sound), **not** a security
> boundary. Run only trusted, self-authored workflow scripts. See `SECURITY.md`.

## License

MIT
