import type { Executor, AgentRequest, AgentResult } from '../types.js'
import { extractJson, validate } from '../schema.js'

// Minimal structural shape of the OpenCode SDK client we depend on — keeps the core engine
// free of an @opencode-ai/sdk import (the real client is structurally assignable). See vogtsw runner.ts.
export interface OpenCodeClient {
  session: {
    create(input: {
      body: { parentID?: string; title?: string }
      query?: { directory?: string }
    }): Promise<{ data?: { id: string } }>
    prompt(input: {
      path: { id: string }
      query?: { directory?: string }
      body: {
        agent?: string
        model?: { providerID: string; modelID: string }
        tools?: Record<string, boolean>
        parts: { type: string; text: string }[]
      }
    }): Promise<{
      data?: { parts: { type: string; text?: string; synthetic?: boolean; ignored?: boolean }[]; info?: { error?: unknown } }
    }>
  }
}

export interface OpenCodeExecutorOpts {
  client: OpenCodeClient
  directory?: string
  defaultAgent?: string
  defaultModel?: string // "provider/model", e.g. "anthropic/claude-sonnet-4-6"
}

function parseModel(model?: string): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const i = model.indexOf('/')
  if (i <= 0 || i === model.length - 1) return undefined
  return { providerID: model.slice(0, i), modelID: model.slice(i + 1) }
}

// Disable our own plugin tool inside child sessions so a leaf agent can't recursively launch workflows.
const DISABLED_TOOLS = { dwf_run_workflow: false }

/**
 * Leaf executor that runs each agent() as an OpenCode sub-session — so leaves get OpenCode's real
 * coding tools. This is the "ship it into OpenCode" backend; it validates the engine is backend-agnostic.
 * NOTE: OpenCode does not surface token usage, so outputTokens is an estimate (budget is approximate here).
 */
export class OpenCodeExecutor implements Executor {
  constructor(private opts: OpenCodeExecutorOpts) {}

  fingerprint(): string {
    return 'opencode:' + (this.opts.defaultModel ?? 'default')
  }

  async run(req: AgentRequest, _signal?: AbortSignal): Promise<AgentResult> {
    const { client, directory, defaultAgent, defaultModel } = this.opts
    const session = await client.session.create({ body: { title: req.agentId }, query: { directory } })
    const id = session.data?.id
    if (!id) throw new Error('opencode: session.create returned no session id')

    let prompt = req.prompt
    if (req.opts.schema) {
      prompt += '\n\nRespond with ONLY a single JSON object matching this JSON Schema (no prose, no code fence):\n' + JSON.stringify(req.opts.schema)
    }

    const resp = await client.session.prompt({
      path: { id },
      query: { directory },
      body: {
        agent: defaultAgent,
        model: parseModel(req.opts.model ?? defaultModel),
        tools: DISABLED_TOOLS,
        parts: [{ type: 'text', text: prompt }],
      },
    })

    if (resp.data?.info?.error) throw new Error('opencode task failed: ' + JSON.stringify(resp.data.info.error))
    const text = (resp.data?.parts ?? [])
      .filter((p) => p.type === 'text' && !p.synthetic && !p.ignored)
      .map((p) => p.text ?? '')
      .join('\n')
      .trim()

    const usage = { inputTokens: 0, outputTokens: Math.ceil(text.length / 4) } // OpenCode hides real usage → estimate

    if (req.opts.schema) {
      const structured = extractJson(text)
      const v = validate(structured, req.opts.schema)
      if (!v.ok) throw new Error('opencode structured output failed validation: ' + v.errors.join('; '))
      return { text, structured, usage }
    }
    return { text, usage }
  }
}
