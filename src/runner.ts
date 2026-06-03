import os from 'node:os'
import { join } from 'node:path'
import { loadWorkflow } from './loader.js'
import { runInSandbox } from './sandbox.js'
import { Journal } from './journal.js'
import { Limiter, defaultConcurrency } from './scheduler.js'
import { makeBudget } from './budget.js'
import { makeGlobals } from './primitives.js'
import type { Executor, RunContext, RunState } from './types.js'

export interface RunOptions {
  executor: Executor
  runsDir?: string
  args?: unknown
  concurrency?: number
  budget?: number | null
  /** Reserved for resume (wired in the resume step): seed the journal from a prior run. */
  resumeFromRunId?: string
}

export interface RunResult {
  result: unknown
  runId: string
  meta: { name: string; description: string }
  events: object[]
}

export async function runWorkflow(source: string, opts: RunOptions): Promise<RunResult> {
  const { meta, runId, body } = loadWorkflow(source, 'workflow.js', opts.args)
  const runsDir = opts.runsDir ?? join(process.cwd(), '.dwf-runs')
  const journal = new Journal(join(runsDir, runId, 'journal.jsonl'))
  const events: object[] = []
  const state: RunState = { ordinal: 0, chain: '', agentCount: 0, currentPhase: '', agentSeq: 0, tokensSpent: 0 }

  const ctx: RunContext = {
    executor: opts.executor,
    journal,
    scheduler: new Limiter(opts.concurrency ?? defaultConcurrency(os.cpus().length)),
    budget: makeBudget(opts.budget ?? null),
    args: opts.args,
    runId,
    state,
    signal: new AbortController().signal,
    emit: (ev) => events.push(ev),
  }

  const globals = makeGlobals(ctx) as unknown as Record<string, unknown>
  const result = await runInSandbox(body, globals)
  return { result, runId, meta: { name: meta.name, description: meta.description }, events }
}
