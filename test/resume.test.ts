import { test, expect } from 'vitest'
import { runWorkflow } from '../src/runner.js'
import { MockBackend } from '../src/executor/mock.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = () => mkdtempSync(join(tmpdir(), 'dwf-res-'))

const V1 = `export const meta = { name: 't', description: 'd' }
const a = await agent('A')
const b = await agent('B')
const c = await agent('C')
return [a, b, c].length`

const V2_EDIT_B = `export const meta = { name: 't', description: 'd' }
const a = await agent('A')
const b = await agent('B-EDITED')
const c = await agent('C')
return [a, b, c].length`

test('edit call N → N and everything downstream re-run; upstream is a 0-token cache hit', async () => {
  const runsDir = tmp()
  const m1 = new MockBackend()
  const r1 = await runWorkflow(V1, { executor: m1, runsDir })
  expect(m1.calls.map((c) => c.prompt)).toEqual(['A', 'B', 'C']) // cold run: all three execute

  const m2 = new MockBackend()
  await runWorkflow(V2_EDIT_B, { executor: m2, runsDir, resumeFromRunId: r1.runId })
  // A is unchanged → cached (executor NOT called). B-EDITED changed → re-runs.
  // C's text is identical but its PREFIX changed (B before it changed) → it cascades and re-runs too.
  expect(m2.calls.map((c) => c.prompt)).toEqual(['B-EDITED', 'C'])
})

test('an identical re-run is a full 0-call cache hit', async () => {
  const runsDir = tmp()
  const m1 = new MockBackend()
  const r1 = await runWorkflow(V1, { executor: m1, runsDir })
  expect(m1.calls.length).toBe(3)

  const m2 = new MockBackend()
  const r2 = await runWorkflow(V1, { executor: m2, runsDir, resumeFromRunId: r1.runId })
  expect(m2.calls.length).toBe(0) // every key matches → nothing executes
  expect(r2.result).toBe(3) // ...but the result is still correct (served from journal)
})

test('a different backend (fingerprint) does NOT reuse another backend\'s cached results', async () => {
  const runsDir = tmp()
  const m1 = new MockBackend()
  const r1 = await runWorkflow(V1, { executor: m1, runsDir })
  expect(m1.calls.length).toBe(3)

  // a "real-ish" executor with a different fingerprint, resuming the same runId
  let realCalls = 0
  const realish = {
    fingerprint: () => 'anthropic:some-model',
    async run(req: any) {
      realCalls++
      return { text: 'R:' + req.prompt, usage: { inputTokens: 0, outputTokens: 1 } }
    },
  }
  await runWorkflow(V1, { executor: realish as any, runsDir, resumeFromRunId: r1.runId })
  expect(realCalls).toBe(3) // all re-run — no cross-backend cache hits
})

test('editing the FIRST call re-runs everything', async () => {
  const runsDir = tmp()
  const m1 = new MockBackend()
  const r1 = await runWorkflow(V1, { executor: m1, runsDir })

  const V2_EDIT_A = V1.replace("agent('A')", "agent('A-EDITED')")
  const m2 = new MockBackend()
  await runWorkflow(V2_EDIT_A, { executor: m2, runsDir, resumeFromRunId: r1.runId })
  expect(m2.calls.map((c) => c.prompt)).toEqual(['A-EDITED', 'B', 'C']) // whole chain cascades
})
