import { test, expect } from 'vitest'
import { makeGlobals } from '../src/primitives.js'
import { Journal } from '../src/journal.js'
import { Limiter } from '../src/scheduler.js'
import { MockBackend } from '../src/executor/mock.js'
import { makeBudget } from '../src/budget.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function makeCtx(executor = new MockBackend()) {
  const dir = mkdtempSync(join(tmpdir(), 'dwf-p-'))
  const path = join(dir, 'journal.jsonl')
  const fresh = () =>
    ({
      executor,
      journal: new Journal(path),
      scheduler: new Limiter(4),
      budget: makeBudget(null),
      args: undefined,
      runId: 'wf_test',
      signal: new AbortController().signal,
      state: { ordinal: 0, chain: '', agentCount: 0, currentPhase: '', agentSeq: 0, tokensSpent: 0 },
      emit: () => {},
    }) as any
  return { fresh }
}

test('parallel: async-reject → null, run survives', async () => {
  const g = makeGlobals(makeCtx().fresh())
  const out = await g.parallel([() => g.agent('ok'), () => Promise.reject(new Error('async'))])
  expect(out[0]).toBeTruthy()
  expect(out[1]).toBeNull()
})

test('parallel: SYNCHRONOUS throw in a thunk escapes synchronously (crashes the run unless wrapped)', () => {
  // Faithful to the real engine (impl-ref §3.2): t() is invoked directly inside .map, so a
  // synchronous throw escapes before Promise.all — it is NOT swallowed to null like an async reject.
  // `try { await parallel(...) }` still catches it (the await arg throws synchronously); uncaught → run fails.
  const g = makeGlobals(makeCtx().fresh())
  expect(() => g.parallel([() => { throw new Error('sync-throw') }])).toThrow('sync-throw')
})

test('pipeline: a stage throw drops only that item to null; siblings flow', async () => {
  const g = makeGlobals(makeCtx().fresh())
  const out = await g.pipeline(['a', 'b'], (item: string) => {
    if (item === 'a') throw new Error('boom')
    return item + '-done'
  })
  expect(out).toEqual([null, 'b-done'])
})

test('pipeline stage signature is (prev, originalItem, index)', async () => {
  const g = makeGlobals(makeCtx().fresh())
  const seen: any[] = []
  await g.pipeline(['x'], (prev: any, orig: any, i: any) => {
    seen.push([prev, orig, i])
    return 'r'
  })
  expect(seen[0]).toEqual(['x', 'x', 0])
})

test('agent: identical call hits journal on second run (executor not called again)', async () => {
  const { fresh } = makeCtx()
  const c1 = fresh()
  await makeGlobals(c1).agent('same') // first run records to disk
  const c2 = fresh() // new Journal loads prior from disk; shares the same MockBackend
  const before = (c2.executor as MockBackend).calls.length
  await makeGlobals(c2).agent('same')
  expect((c2.executor as MockBackend).calls.length).toBe(before) // cached → executor NOT called
})

test('parallel([]) and pipeline([]) → []', async () => {
  const g = makeGlobals(makeCtx().fresh())
  expect(await g.parallel([])).toEqual([])
  expect(await g.pipeline([], (x: any) => x)).toEqual([])
})
