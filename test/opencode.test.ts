import { test, expect } from 'vitest'
import { OpenCodeExecutor } from '../src/executor/opencode.js'

const sig = new AbortController().signal

function fakeClient(parts: any[], info: any = {}) {
  const calls: any[] = []
  const client = {
    session: {
      create: async (i: any) => {
        calls.push(['create', i])
        return { data: { id: 'sess-1' } }
      },
      prompt: async (i: any) => {
        calls.push(['prompt', i])
        return { data: { parts, info } }
      },
    },
  }
  return { client, calls }
}

test('creates a session, prompts it, extracts text', async () => {
  const { client, calls } = fakeClient([{ type: 'text', text: 'hello from opencode' }])
  const ex = new OpenCodeExecutor({ client: client as any, directory: '/proj' })
  const r = await ex.run({ prompt: 'hi', opts: {}, agentId: 'a1' }, sig)
  expect(r.text).toBe('hello from opencode')
  expect(calls[0][0]).toBe('create')
  expect(calls[1][1].body.parts[0].text).toBe('hi')
})

test('filters synthetic/ignored parts', async () => {
  const { client } = fakeClient([
    { type: 'text', text: 'keep' },
    { type: 'text', text: 'drop', synthetic: true },
    { type: 'text', text: 'drop2', ignored: true },
  ])
  const ex = new OpenCodeExecutor({ client: client as any })
  expect((await ex.run({ prompt: 'p', opts: {}, agentId: 'a1' }, sig)).text).toBe('keep')
})

test('schema path: extracts + validates JSON from the reply', async () => {
  const { client } = fakeClient([{ type: 'text', text: 'sure, here: {"n": 5}' }])
  const ex = new OpenCodeExecutor({ client: client as any })
  const schema = { type: 'object', required: ['n'], properties: { n: { type: 'number' } } }
  const r = await ex.run({ prompt: 'p', opts: { schema }, agentId: 'a1' }, sig)
  expect(r.structured).toEqual({ n: 5 })
})

test('parses provider/model and passes it through', async () => {
  const { client, calls } = fakeClient([{ type: 'text', text: 'ok' }])
  const ex = new OpenCodeExecutor({ client: client as any, defaultModel: 'anthropic/claude-sonnet-4-6' })
  await ex.run({ prompt: 'p', opts: {}, agentId: 'a1' }, sig)
  expect(calls[1][1].body.model).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-4-6' })
  expect(ex.fingerprint()).toBe('opencode:anthropic/claude-sonnet-4-6')
})

test('throws when the session reports an error', async () => {
  const { client } = fakeClient([], { error: { data: { message: 'boom' } } })
  const ex = new OpenCodeExecutor({ client: client as any })
  await expect(ex.run({ prompt: 'p', opts: {}, agentId: 'a1' }, sig)).rejects.toThrow(/opencode task failed/)
})
