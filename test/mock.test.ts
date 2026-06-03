import { test, expect } from 'vitest'
import { MockBackend } from '../src/executor/mock.js'

const sig = new AbortController().signal

test('mock is deterministic and pure (same input → same output)', async () => {
  const m = new MockBackend()
  const r1 = await m.run({ prompt: 'hello world', opts: {}, agentId: 'a1' }, sig)
  const r2 = await m.run({ prompt: 'hello world', opts: {}, agentId: 'a2' }, sig)
  expect(r1.text).toBe(r2.text)
  expect(r1.text).toContain('[mock] hello world')
})

test('mock synthesizes from schema (required fields only)', async () => {
  const m = new MockBackend()
  const schema = {
    type: 'object',
    required: ['name', 'count'],
    properties: { name: { type: 'string' }, count: { type: 'number' }, tag: { enum: ['a', 'b'] } },
  }
  const r = await m.run({ prompt: 'p', opts: { schema }, agentId: 'a1' }, sig)
  expect(r.structured).toEqual({ name: 'mock', count: 0 })
})

test('mock records calls and reports usage', async () => {
  const m = new MockBackend()
  await m.run({ prompt: 'abc', opts: {}, agentId: 'a1' }, sig)
  expect(m.calls.length).toBe(1)
  expect(m.calls[0].prompt).toBe('abc')
})

test('responder override wins', async () => {
  const m = new MockBackend({ responder: () => ({ text: 'X', usage: { inputTokens: 0, outputTokens: 0 } }) })
  expect((await m.run({ prompt: 'p', opts: {}, agentId: 'a1' }, sig)).text).toBe('X')
})
