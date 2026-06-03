import type { Budget } from './types.js'

/** Tokens optimistically reserved per in-flight agent so concurrent calls can't all slip past the gate. */
export const DEFAULT_RESERVE = 1024

export interface RunBudget extends Budget {
  /** used (settled) + reserved (in-flight). The gate is checked against this, not just `used`. */
  committed(): number
  exhausted(): boolean
  /** Reserve at slot-acquire. Returns false (caller should throw) if we're already at the ceiling. */
  reserve(estimate: number): boolean
  /** After a call returns: drop the reservation, record the real output tokens. */
  settle(estimate: number, actual: number): void
  /** After a call throws: drop the reservation without spending. */
  release(estimate: number): void
  /** Settle without a prior reservation (used by simple callers/tests). */
  add(actual: number): void
}

export function makeBudget(total: number | null): RunBudget {
  let used = 0
  let reserved = 0
  const committed = () => used + reserved
  return {
    total,
    spent: () => used,
    committed,
    remaining: () => (total === null ? Infinity : Math.max(0, total - committed())),
    exhausted: () => total !== null && committed() >= total,
    reserve(estimate: number): boolean {
      // Allow a new agent only while we are still under the ceiling (counting in-flight reservations).
      if (total !== null && committed() >= total) return false
      reserved += estimate
      return true
    },
    settle(estimate: number, actual: number): void {
      reserved = Math.max(0, reserved - estimate)
      used += actual
    },
    release(estimate: number): void {
      reserved = Math.max(0, reserved - estimate)
    },
    add(actual: number): void {
      used += actual
    },
  }
}
