import { test, expect } from 'vitest'
import { validate, extractJson, toToolDef } from '../src/schema.js'

test('validate accepts good, rejects bad, rejects NaN/Infinity', () => {
  const s = { type: 'object', required: ['n'], properties: { n: { type: 'number' } } }
  expect(validate({ n: 1 }, s).ok).toBe(true)
  expect(validate({}, s).ok).toBe(false)
  expect(validate({ n: NaN }, s).ok).toBe(false)
  expect(validate({ n: Infinity }, s).ok).toBe(false)
})

test('extractJson: whole → fenced → balanced span', () => {
  expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  expect(extractJson('text ```json\n{"a":2}\n``` more')).toEqual({ a: 2 })
  expect(extractJson('prefix {"a":3} suffix')).toEqual({ a: 3 })
})

test('toToolDef wraps a schema as the StructuredOutput tool', () => {
  const t = toToolDef({ type: 'object' })
  expect(t.name).toBe('StructuredOutput')
  expect(t.input_schema).toEqual({ type: 'object' })
})
