import { test, expect } from 'vitest'
import { runInSandbox } from '../src/sandbox.js'

const run = (body: string, globals: Record<string, unknown> = {}) => runInSandbox(body, globals)

test('Math.random throws', async () => {
  await expect(run('return Math.random()')).rejects.toThrow()
})

test('Date.now throws', async () => {
  await expect(run('return Date.now()')).rejects.toThrow()
})

test('argless new Date throws; new Date(value) is allowed', async () => {
  await expect(run('return new Date()')).rejects.toThrow()
  await expect(run('return new Date(0).getTime()')).resolves.toBe(0)
})

test('aliased Math.random (escapes the static scan) is still trapped at runtime', async () => {
  await expect(run('const M = Math; return M["random"]()')).rejects.toThrow()
})

test('require/process/fetch are undefined', async () => {
  expect(await run('return typeof require')).toBe('undefined')
  expect(await run('return typeof process')).toBe('undefined')
  expect(await run('return typeof fetch')).toBe('undefined')
})

test('injected globals are reachable; JSON/Array work', async () => {
  expect(await run('return greet("x")', { greet: (s: string) => 'hi ' + s })).toBe('hi x')
  expect(await run('return JSON.stringify([1,2])')).toBe('[1,2]')
})

test('static scan rejects literal Date.now even inside a string', async () => {
  await expect(run('const s = "Date.now()"; return 1')).rejects.toThrow(/deterministic/i)
})
