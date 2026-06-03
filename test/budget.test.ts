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

test('reserve gates on committed (used+reserved); settle swaps the estimate for the actual', () => {
  const b = makeBudget(100)
  expect(b.reserve(50)).toBe(true)
  expect(b.committed()).toBe(50)
  b.settle(50, 10)
  expect(b.committed()).toBe(10)
  expect(b.spent()).toBe(10)
})

test('reserve allows the first agent even if estimate > total, then blocks once at the ceiling', () => {
  const b = makeBudget(10)
  expect(b.reserve(1000)).toBe(true) // committed was 0 (< total) → first agent allowed
  expect(b.reserve(1)).toBe(false) // committed (1000) >= total → blocked
})

test('release drops a reservation without spending', () => {
  const b = makeBudget(100)
  b.reserve(40)
  b.release(40)
  expect(b.committed()).toBe(0)
  expect(b.spent()).toBe(0)
})

test('null total never blocks', () => {
  expect(makeBudget(null).reserve(1e9)).toBe(true)
})
