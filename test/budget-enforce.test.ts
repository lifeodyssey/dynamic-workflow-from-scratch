import { test, expect } from 'vitest'
import { runWorkflow } from '../src/runner.js'
import { MockBackend } from '../src/executor/mock.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = () => mkdtempSync(join(tmpdir(), 'dwf-bud-'))

test('a small budget stops the run with a budget error', async () => {
  const SRC = `export const meta = { name: 'b', description: 'd' }
let n = 0
for (let i = 0; i < 200; i++) { await agent('item number ' + i); n++ }
return n`
  await expect(runWorkflow(SRC, { executor: new MockBackend(), runsDir: tmp(), budget: 30 })).rejects.toThrow(/budget/i)
})

test('no budget set → runs to completion', async () => {
  const SRC = `export const meta = { name: 'b', description: 'd' }
const xs = await parallel([1, 2, 3].map((i) => () => agent('x' + i)))
return xs.length`
  const res = await runWorkflow(SRC, { executor: new MockBackend(), runsDir: tmp() })
  expect(res.result).toBe(3)
})
