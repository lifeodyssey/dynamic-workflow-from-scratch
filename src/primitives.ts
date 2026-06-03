import type { RunContext, AgentOpts, AgentResult } from './types.js'
import { MAX_TOTAL_AGENTS } from './types.js'
import { chainKey } from './journal.js'
import { DEFAULT_RESERVE as RESERVE } from './budget.js'

/**
 * Build the workflow DSL globals, each closing over the per-run context.
 * `agent()` is the only backend-bound, token-spending primitive.
 * See implementation-reference §3.1–§3.2 — the parallel/pipeline bodies are exact.
 */
export function makeGlobals(ctx: RunContext) {
  const unwrap = (r: AgentResult, opts: AgentOpts): unknown => (opts.schema ? (r.structured ?? r) : r.text)

  async function agent(prompt: string, opts: AgentOpts = {}): Promise<unknown> {
    // 1) advance ordinal + prefix chain SYNCHRONOUSLY before any await (gotcha: cascade under concurrency)
    const ordinal = ++ctx.state.ordinal
    const { key, chain } = chainKey(ctx.state.chain, prompt, opts)
    ctx.state.chain = chain
    const agentId = 'a' + String(ordinal).padStart(3, '0') + '-' + ++ctx.state.agentSeq

    // 2) journal lookup BEFORE acquiring a concurrency slot
    const cached = ctx.journal.lookup(key)
    if (cached.hit) {
      ctx.emit({ ev: 'agent', cached: true, agentId, phase: ctx.state.currentPhase, outputTokens: 0 })
      return unwrap(cached.result, opts)
    }
    ctx.emit({ ev: 'agent', cached: false, agentId, phase: ctx.state.currentPhase })

    return ctx.scheduler.run(async () => {
      if (ctx.state.agentCount >= MAX_TOTAL_AGENTS) throw new Error('WorkflowAgentCapError: exceeded 1000 agents')
      // Reserve-at-slot: account for this in-flight agent so concurrent calls can't all overshoot the ceiling.
      if (!ctx.budget.reserve(RESERVE)) throw new Error('Workflow token budget exceeded')
      ctx.journal.recordStarted(key, agentId)
      try {
        const resp = await ctx.executor.run({ prompt, opts, agentId }, ctx.signal)
        ctx.budget.settle(RESERVE, resp.usage.outputTokens) // swap the estimate for the real cost
        ctx.state.agentCount++
        ctx.state.tokensSpent += resp.usage.outputTokens
        ctx.journal.recordResult(key, agentId, resp)
        ctx.emit({ ev: 'agent', cached: false, agentId, phase: ctx.state.currentPhase, outputTokens: resp.usage.outputTokens, done: true })
        return unwrap(resp, opts)
      } catch (e) {
        ctx.budget.release(RESERVE) // failed call spends nothing
        throw e
      }
    })
  }

  // BARRIER over thunks: async reject → null; a SYNCHRONOUS throw propagates (rejects the whole call).
  const parallel = (thunks: Array<() => Promise<unknown>>): Promise<unknown[]> =>
    Promise.all(thunks.map((t) => t().then((v) => v, () => null)))

  // NO-BARRIER per item; a stage throw (sync/async) drops THAT item to null and skips its remaining stages.
  const pipeline = (items: unknown[], ...stages: Array<(prev: any, item: any, i: number) => unknown>): Promise<unknown[]> =>
    Promise.all(
      items.map((item, i) =>
        (async () => {
          try {
            let acc: any = item
            for (const s of stages) acc = await s(acc, item, i)
            return acc
          } catch {
            return null
          }
        })(),
      ),
    )

  const phase = (t: string) => {
    ctx.state.currentPhase = t
    ctx.emit({ ev: 'phase', title: t })
  }
  const log = (m: string) => ctx.emit({ ev: 'log', message: m })
  const workflow = () => {
    throw new Error('workflow() cannot be called from within a child workflow — nesting is limited to one level.')
  }

  return { agent, parallel, pipeline, phase, log, workflow, args: ctx.args, budget: ctx.budget }
}
