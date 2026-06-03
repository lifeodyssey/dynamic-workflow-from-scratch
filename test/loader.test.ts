import { test, expect } from 'vitest'
import { loadWorkflow, stripExport } from '../src/loader.js'

const SRC = `export const meta = { name: 'demo', description: 'd', phases: [{ title: 'A' }] }
const x = await agent('hi')
return x`

test('extracts a pure-literal meta', () => {
  expect(loadWorkflow(SRC, 'w.js').meta.name).toBe('demo')
})

test('rejects non-literal meta (identifier/call)', () => {
  expect(() => loadWorkflow(`export const meta = { name: foo(), description: 'd' }`, 'w.js')).toThrow()
})

test('rejects meta with a reserved key', () => {
  expect(() => loadWorkflow(`export const meta = { name: 'n', description: 'd', constructor: 1 }`, 'w.js')).toThrow()
})

test('runId is deterministic in source+args', () => {
  expect(loadWorkflow(SRC, 'w.js', { a: 1 }).runId).toBe(loadWorkflow(SRC, 'w.js', { a: 1 }).runId)
  expect(loadWorkflow(SRC, 'w.js', { a: 2 }).runId).not.toBe(loadWorkflow(SRC, 'w.js', { a: 1 }).runId)
  expect(loadWorkflow(SRC, 'w.js').runId.startsWith('wf_')).toBe(true)
})

test('stripExport removes the leading export but keeps the declaration; meta literal with braces in a string is balanced', () => {
  expect(stripExport(`export const meta = {}`)).toBe(`const meta = {}`)
  // brace inside a string must not break extraction
  expect(loadWorkflow(`export const meta = { name: 'a}b', description: 'd' }`, 'w.js').meta.name).toBe('a}b')
})
