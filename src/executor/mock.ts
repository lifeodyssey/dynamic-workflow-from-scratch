import type { Executor, AgentRequest, AgentResult } from '../types.js'

/** Pure, prompt-derived synthesis of a value matching a JSON schema. No clock/RNG. */
export function synthesize(schema: any): unknown {
  if (!schema || typeof schema !== 'object') return null
  if (Array.isArray(schema.enum)) return schema.enum[0]
  switch (schema.type) {
    case 'string':
      return 'mock'
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'null':
      return null
    case 'array':
      return []
    case 'object': {
      const o: Record<string, unknown> = {}
      for (const k of schema.required ?? []) o[k] = synthesize(schema.properties?.[k])
      return o
    }
    default:
      return null
  }
}

const t = (s: string) => Math.ceil(s.length / 4)

export class MockBackend implements Executor {
  calls: AgentRequest[] = []

  constructor(private opt: { responder?: (r: AgentRequest) => AgentResult } = {}) {}

  fingerprint(): string {
    return 'mock'
  }

  async run(req: AgentRequest, _signal?: AbortSignal): Promise<AgentResult> {
    this.calls.push(req)
    if (this.opt.responder) return this.opt.responder(req)
    if (req.opts.schema) {
      const s = synthesize(req.opts.schema)
      const text = JSON.stringify(s)
      return { text, structured: s, usage: { inputTokens: t(req.prompt), outputTokens: t(text) } }
    }
    const text = '[mock] ' + req.prompt.slice(0, 60)
    return { text, usage: { inputTokens: t(req.prompt), outputTokens: t(text) } }
  }
}
