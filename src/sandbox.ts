import { createContext, Script } from 'node:vm'

// Submit-time static scan (layer 1): reject the literal nondeterministic forms even inside
// strings/comments, matching the real engine's source-text check. The aliased forms
// (e.g. `const D = Date; D.now()`) are caught by the runtime traps below (layer 2).
const FORBIDDEN: { re: RegExp }[] = [
  { re: /\bDate\s*\.\s*now\s*\(/ },
  { re: /\bMath\s*\.\s*random\s*\(/ },
  { re: /\bnew\s+Date\s*\(\s*\)/ },
]

export function scanDeterminism(body: string): void {
  for (const { re } of FORBIDDEN) {
    if (re.test(body)) {
      throw new Error(
        'Workflow scripts must be deterministic: clock/random APIs are unavailable (breaks resume). Pass timestamps via args.',
      )
    }
  }
}

function makeSafeMath(): Record<string, unknown> {
  const m: Record<string, unknown> = Object.create(null)
  for (const k of Object.getOwnPropertyNames(Math)) {
    const v = (Math as any)[k]
    m[k] = typeof v === 'function' ? v.bind(Math) : v
  }
  m.random = () => {
    throw new Error('Math.random() is unavailable in a deterministic workflow (breaks resume)')
  }
  return m
}

// Hardened Date: argless `new Date()` and bare `Date()` throw; `new Date(value)` keeps its
// [[DateValue]] but homes on a sanitized prototype with no `.constructor` path back to the live clock.
function makeSafeDate(): unknown {
  const RealDate = Date
  const SafeDate: any = function (this: unknown, ...args: unknown[]) {
    if (new.target === undefined) throw new Error('Date() is unavailable in a deterministic workflow')
    if (args.length === 0) throw new Error('new Date() (current time) is unavailable; pass a value or use args')
    return Reflect.construct(RealDate as any, args as any[], SafeDate)
  }
  const safeProto = Object.create(Object.prototype)
  for (const key of Reflect.ownKeys(RealDate.prototype)) {
    if (key === 'constructor') continue
    Object.defineProperty(safeProto, key, Object.getOwnPropertyDescriptor(RealDate.prototype, key)!)
  }
  Object.defineProperty(safeProto, 'constructor', { value: SafeDate })
  Object.defineProperty(SafeDate, 'prototype', { value: safeProto, writable: false })
  SafeDate.now = () => {
    throw new Error('Date.now() is unavailable in a deterministic workflow (breaks resume)')
  }
  SafeDate.parse = RealDate.parse.bind(RealDate)
  SafeDate.UTC = RealDate.UTC.bind(RealDate)
  return SafeDate
}

const stderr = (...a: unknown[]) => process.stderr.write(a.map(String).join(' ') + '\n')

function buildSandbox(globals: Record<string, unknown>): Record<string, unknown> {
  return {
    JSON, Object, Array, String, Number, Boolean, Promise, Map, Set, WeakMap, WeakSet, RegExp, Error, Symbol,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    Math: makeSafeMath(),
    Date: makeSafeDate(),
    // Intl is intentionally omitted: Intl.DateTimeFormat().format() reads the system clock in C++,
    // bypassing the Date trap. require/process/fetch/timers/structuredClone are omitted too.
    console: { log: stderr, error: stderr, warn: stderr, info: stderr, debug: stderr },
    ...globals,
  }
}

/** Run a workflow body in an isolated node:vm context with determinism guards + injected globals. */
export async function runInSandbox(body: string, globals: Record<string, unknown> = {}): Promise<unknown> {
  scanDeterminism(body)
  const ctx = createContext(buildSandbox(globals), { name: 'workflow', codeGeneration: { strings: false, wasm: false } })
  const wrapped = '(async () => {\n' + body + '\n})()'
  const script = new Script(wrapped, { filename: 'workflow.js' })
  return await script.runInContext(ctx)
}
