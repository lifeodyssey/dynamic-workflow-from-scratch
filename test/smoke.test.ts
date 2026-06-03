import { test, expect } from 'vitest'
import { VERSION } from '../src/index.js'

test('package boots', () => {
  expect(VERSION).toBe('0.1.0')
})
