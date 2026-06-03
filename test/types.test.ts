import { test, expect } from 'vitest'
import type { AgentOpts, AgentRequest, AgentResult, WorkflowMeta } from '../src/types.js'

test('types are usable', () => {
  const opts: AgentOpts = { schema: { type: 'object' }, label: 'x', model: 'opus' }
  const req: AgentRequest = { prompt: 'hi', opts, agentId: 'a001-1' }
  const res: AgentResult = { text: 'ok', usage: { inputTokens: 1, outputTokens: 2 } }
  const meta: WorkflowMeta = { name: 'n', description: 'd' }
  expect(req.opts.label).toBe('x')
  expect(res.usage.outputTokens).toBe(2)
  expect(meta.name).toBe('n')
})
