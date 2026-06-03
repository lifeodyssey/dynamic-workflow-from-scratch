# Security model

A workflow runs in a `node:vm` context with only the DSL (`agent` / `parallel` / `pipeline` /
`phase` / `log` / `args` / `budget`) and a curated allowlist of intrinsics injected, plus a
determinism guard (clock and RNG throw).

**`node:vm` is a determinism boundary, not a security boundary.** A determined script can escape
via `.constructor` on any injected object — e.g. `Array.constructor('return process')()` reaches
the host `process`, and from there `child_process` / `fs` / the network. The guard exists so
**journaled replay is sound** (the same script re-produces the same `agent()` call sequence), not
to contain untrusted code.

**Only run trusted, self-authored (or model-authored-on-your-behalf) workflow scripts.** For
genuinely adversarial code, run the whole engine inside an OS / container / VM sandbox.
