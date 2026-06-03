import { test, expect } from 'vitest'
import { stableStringify, chainKey, Journal } from '../src/journal.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('stableStringify is key-sorted but preserves array order', () => {
  expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
})

test('chainKey folds the prefix: editing call N changes N and all downstream, not upstream', () => {
  const o = {}
  const a1 = chainKey('', 'A', o)
  const b1 = chainKey(a1.chain, 'B', o)
  const c1 = chainKey(b1.chain, 'C', o)
  // edit B → B,C keys change; A unchanged
  const b2 = chainKey(a1.chain, 'B-edited', o)
  const c2 = chainKey(b2.chain, 'C', o)
  expect(b2.key).not.toBe(b1.key)
  expect(c2.key).not.toBe(c1.key)
  expect(chainKey('', 'A', o).key).toBe(a1.key) // upstream stable
})

test('label and phase are excluded from the key; schema/model/agentType/isolation are included', () => {
  const base = chainKey('', 'P', { model: 'opus' })
  expect(chainKey('', 'P', { model: 'opus', label: 'x', phase: 'y' }).key).toBe(base.key)
  expect(chainKey('', 'P', { model: 'sonnet' }).key).not.toBe(base.key)
  expect(chainKey('', 'P', { schema: { type: 'object' } }).key).not.toBe(chainKey('', 'P', {}).key)
})

test('journal append + lookup roundtrip; lookup miss before write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dwf-j-'))
  const j = new Journal(join(dir, 'journal.jsonl'))
  expect(j.lookup('v2:abc').hit).toBe(false)
  j.recordStarted('v2:abc', 'a001-1')
  j.recordResult('v2:abc', 'a001-1', { text: 'hi', usage: { inputTokens: 1, outputTokens: 2 } })
  const j2 = new Journal(join(dir, 'journal.jsonl')) // reopen → loads prior
  expect(j2.lookup('v2:abc')).toEqual({ hit: true, result: { text: 'hi', usage: { inputTokens: 1, outputTokens: 2 } } })
  rmSync(dir, { recursive: true, force: true })
})
