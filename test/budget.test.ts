import { test, expect } from 'vitest'
import { makeBudget } from '../src/budget.js'

test('null total → infinite remaining', () => {
  const b = makeBudget(null)
  expect(b.remaining()).toBe(Infinity)
  b.add(100)
  expect(b.spent()).toBe(100)
})

test('remaining clamps at 0 and tracks spend', () => {
  const b = makeBudget(50)
  b.add(20)
  expect(b.remaining()).toBe(30)
  b.add(40)
  expect(b.remaining()).toBe(0)
})

test('exhausted() true once spent >= total', () => {
  const b = makeBudget(10)
  expect(b.exhausted()).toBe(false)
  b.add(10)
  expect(b.exhausted()).toBe(true)
})
