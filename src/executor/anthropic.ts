import Anthropic from '@anthropic-ai/sdk'
import type { Executor, AgentRequest, AgentResult } from '../types.js'
import { toToolDef, validate } from '../schema.js'

/** Minimal shape we depend on — keeps us robust to SDK version drift. */
interface MessagesClient {
  messages: { create(body: any): Promise<any> }
}

export interface AnthropicBackendOpts {
  client?: MessagesClient // inject a fake for offline tests
  apiKey?: string
  model?: string
  maxTokens?: number
  system?: string
}

const MAX_RETRIES = 2 // up to 3 model calls

export class AnthropicBackend implements Executor {
  private client: MessagesClient
  private model: string
  private maxTokens: number
  private system?: string

  constructor(opts: AnthropicBackendOpts = {}) {
    this.client =
      opts.client ?? (new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient)
    this.model = opts.model ?? process.env.DWF_MODEL ?? 'claude-sonnet-4-6'
    this.maxTokens = opts.maxTokens ?? 4096
    this.system = opts.system
  }

  async run(req: AgentRequest, _signal?: AbortSignal): Promise<AgentResult> {
    const model = req.opts.model ?? this.model
    return req.opts.schema ? this.runStructured(req, model, req.opts.schema) : this.runText(req, model)
  }

  private base(model: string) {
    return { model, max_tokens: this.maxTokens, ...(this.system ? { system: this.system } : {}) }
  }

  private async runText(req: AgentRequest, model: string): Promise<AgentResult> {
    const msg = await this.client.messages.create({ ...this.base(model), messages: [{ role: 'user', content: req.prompt }] })
    const text = (msg.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
    return { text, usage: { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 } }
  }

  // Forced-tool structured output with retry-on-mismatch via tool_result feedback.
  // (implementation-reference §4.2 — the retry MUST be a tool_result, not bare user text, or the API 400s.)
  private async runStructured(req: AgentRequest, model: string, schema: object): Promise<AgentResult> {
    const toolDef = toToolDef(schema)
    const messages: any[] = [{ role: 'user', content: req.prompt }]
    let inTok = 0
    let outTok = 0

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const msg = await this.client.messages.create({
        ...this.base(model),
        messages,
        tools: [toolDef],
        tool_choice: { type: 'tool', name: 'StructuredOutput' },
      })
      inTok += msg.usage?.input_tokens ?? 0
      outTok += msg.usage?.output_tokens ?? 0

      const toolUse = (msg.content ?? []).find((b: any) => b.type === 'tool_use' && b.name === 'StructuredOutput')
      if (toolUse) {
        const v = validate(toolUse.input, schema)
        if (v.ok) {
          return { text: JSON.stringify(toolUse.input), structured: toolUse.input, usage: { inputTokens: inTok, outputTokens: outTok } }
        }
        if (attempt < MAX_RETRIES) {
          messages.push({ role: 'assistant', content: msg.content })
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: 'Validation errors: ' + v.errors.join('; ') + '. Please fix and call StructuredOutput again.',
              },
            ],
          })
        }
      }
    }
    throw new Error(`StructuredOutput failed schema validation after ${MAX_RETRIES + 1} attempt(s)`)
  }
}
