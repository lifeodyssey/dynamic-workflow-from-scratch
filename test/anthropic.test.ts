import { test, expect } from 'vitest'
import { AnthropicBackend } from '../src/executor/anthropic.js'

const sig = new AbortController().signal

test('forces StructuredOutput and returns a validated object (fake client)', async () => {
  const fake = {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', name: 'StructuredOutput', id: 't1', input: { ok: true } }],
        usage: { input_tokens: 5, output_tokens: 7 },
      }),
    },
  }
  const b = new AnthropicBackend({ client: fake as any, model: 'm' })
  const r = await b.run({ prompt: 'p', opts: { schema: { type: 'object' } }, agentId: 'a1' }, sig)
  expect(r.structured).toEqual({ ok: true })
  expect(r.usage.outputTokens).toBe(7)
})

test('retries with tool_result feedback when validation fails, then succeeds', async () => {
  let n = 0
  const fake = {
    messages: {
      create: async () => {
        n++
        const input = n === 1 ? { wrong: 1 } : { n: 5 }
        return { content: [{ type: 'tool_use', name: 'StructuredOutput', id: 't' + n, input }], usage: { input_tokens: 1, output_tokens: n } }
      },
    },
  }
  const schema = { type: 'object', required: ['n'], properties: { n: { type: 'number' } }, additionalProperties: false }
  const b = new AnthropicBackend({ client: fake as any, model: 'm' })
  const r = await b.run({ prompt: 'p', opts: { schema }, agentId: 'a1' }, sig)
  expect(r.structured).toEqual({ n: 5 })
  expect(n).toBe(2) // retried exactly once
  expect(r.usage.outputTokens).toBe(1 + 2) // accumulated across attempts
})

test('throws after exhausting retries', async () => {
  const fake = {
    messages: {
      create: async () => ({
        content: [{ type: 'tool_use', name: 'StructuredOutput', id: 't', input: { wrong: 1 } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    },
  }
  const schema = { type: 'object', required: ['n'], additionalProperties: false }
  const b = new AnthropicBackend({ client: fake as any, model: 'm' })
  await expect(b.run({ prompt: 'p', opts: { schema }, agentId: 'a1' }, sig)).rejects.toThrow(/failed schema validation/)
})

test('plain (no-schema) call returns assistant text', async () => {
  const fake = {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: 'hello world' }], usage: { input_tokens: 2, output_tokens: 3 } }),
    },
  }
  const b = new AnthropicBackend({ client: fake as any })
  const r = await b.run({ prompt: 'p', opts: {}, agentId: 'a1' }, sig)
  expect(r.text).toBe('hello world')
  expect(r.usage.outputTokens).toBe(3)
})
