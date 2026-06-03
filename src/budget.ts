import type { Budget } from './types.js'

export interface RunBudget extends Budget {
  add(outputTokens: number): void
  exhausted(): boolean
}

export function makeBudget(total: number | null): RunBudget {
  let used = 0
  return {
    total,
    spent: () => used,
    remaining: () => (total === null ? Infinity : Math.max(0, total - used)),
    exhausted: () => total !== null && used >= total,
    add: (n: number) => {
      used += n
    },
  }
}
