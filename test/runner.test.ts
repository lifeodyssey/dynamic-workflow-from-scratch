import { test, expect } from 'vitest'
import { runWorkflow } from '../src/runner.js'
import { MockBackend } from '../src/executor/mock.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = () => mkdtempSync(join(tmpdir(), 'dwf-run-'))

const SRC = `export const meta = { name: 't', description: 'd' }
const xs = await parallel(['a','b','c'].map(s => () => agent('do ' + s)))
return xs.length`

test('runs a fan-out workflow end-to-end on the mock backend', async () => {
  const res = await runWorkflow(SRC, { executor: new MockBackend(), runsDir: tmp() })
  expect(res.result).toBe(3)
  expect(res.runId.startsWith('wf_')).toBe(true)
})

test('a workflow can use phase, pipeline and return structured data', async () => {
  const SRC2 = `export const meta = { name: 'p', description: 'd' }
phase('go')
const out = await pipeline(['x','y'], (s) => agent('echo ' + s))
return { n: out.length }`
  const res = await runWorkflow(SRC2, { executor: new MockBackend(), runsDir: tmp() })
  expect((res.result as any).n).toBe(2)
  expect(res.events.some((e: any) => e.ev === 'phase' && e.title === 'go')).toBe(true)
})

test('args are threaded into the sandbox', async () => {
  const SRC3 = `export const meta = { name: 'a', description: 'd' }
return args.topic`
  const res = await runWorkflow(SRC3, { executor: new MockBackend(), runsDir: tmp(), args: { topic: 'hello' } })
  expect(res.result).toBe('hello')
})
