import { test, expect } from 'vitest'
import { Limiter, defaultConcurrency } from '../src/scheduler.js'

test('never exceeds max concurrency', async () => {
  const lim = new Limiter(2)
  let active = 0
  let peak = 0
  const job = () =>
    new Promise<void>((r) => {
      active++
      peak = Math.max(peak, active)
      setTimeout(() => {
        active--
        r()
      }, 10)
    })
  await Promise.all(Array.from({ length: 8 }, () => lim.run(job)))
  expect(peak).toBe(2)
})

test('FIFO order of completion for equal-duration jobs', async () => {
  const lim = new Limiter(1)
  const order: number[] = []
  await Promise.all([1, 2, 3].map((n) => lim.run(async () => { order.push(n) })))
  expect(order).toEqual([1, 2, 3])
})

test('a rejecting job rejects only its own run() and frees the slot', async () => {
  const lim = new Limiter(1)
  await expect(lim.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
  await expect(lim.run(async () => 'ok')).resolves.toBe('ok')
})

test('a synchronously-throwing fn rejects its run() and frees the slot', async () => {
  const lim = new Limiter(1)
  await expect(lim.run(() => { throw new Error('sync') })).rejects.toThrow('sync')
  await expect(lim.run(async () => 'ok')).resolves.toBe('ok')
})

test('defaultConcurrency is min(16, max(2, cores-2))', () => {
  expect(defaultConcurrency(64)).toBe(16)
  expect(defaultConcurrency(3)).toBe(2)
  expect(defaultConcurrency(10)).toBe(8)
})
