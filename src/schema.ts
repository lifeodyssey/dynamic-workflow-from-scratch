import Ajv, { type ValidateFunction } from 'ajv'

const ajv = new Ajv({ strict: false, allErrors: true })
const compiled = new Map<string, ValidateFunction>()

function hasNonFinite(x: unknown): boolean {
  if (typeof x === 'number') return !Number.isFinite(x)
  if (Array.isArray(x)) return x.some(hasNonFinite)
  if (x && typeof x === 'object') return Object.values(x).some(hasNonFinite)
  return false
}

export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

export function validate(value: unknown, schema: object): ValidationResult {
  // Reject NaN/Infinity even though typeof === 'number': JSON.stringify turns them into null,
  // which would silently corrupt journaled output. (implementation-reference §4.4)
  if (hasNonFinite(value)) return { ok: false, errors: ['value contains NaN or Infinity (not JSON-representable)'] }
  const key = JSON.stringify(schema)
  let fn = compiled.get(key)
  if (!fn) {
    fn = ajv.compile(schema)
    compiled.set(key, fn)
  }
  if (fn(value)) return { ok: true }
  return { ok: false, errors: (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`) }
}

/** Wrap a user schema as the synthetic forced-output tool. (implementation-reference §4.2) */
export function toToolDef(schema: object) {
  return {
    name: 'StructuredOutput',
    description: 'Return a structured value matching the provided JSON Schema.',
    input_schema: schema,
  }
}

/** Portable extraction for non-tool backends: whole reply → fenced block → balanced span. */
export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    /* fall through */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1])
    } catch {
      /* fall through */
    }
  }
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s !== -1 && e > s) {
    try {
      return JSON.parse(text.slice(s, e + 1))
    } catch {
      /* fall through */
    }
  }
  throw new Error('no JSON object found in text')
}
