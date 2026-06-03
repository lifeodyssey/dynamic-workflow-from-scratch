export interface AgentOpts {
  schema?: object // JSON Schema → forced structured output
  label?: string // cosmetic — NOT in cache key
  phase?: string // cosmetic — NOT in cache key
  model?: string // per-call model override
  agentType?: string // subagent persona
  isolation?: 'worktree'
}

export interface AgentRequest {
  prompt: string
  opts: AgentOpts
  agentId: string
}

export interface AgentResult {
  text: string
  structured?: unknown
  usage: { inputTokens: number; outputTokens: number }
}

export interface Executor {
  run(req: AgentRequest, signal: AbortSignal): Promise<AgentResult>
  /**
   * Identity of the backend + model that produces outputs. Mixed into the prefix-chain seed so
   * a run on one backend never serves cached results from another (e.g. mock results to a real run).
   */
  fingerprint?(): string
}

// On-disk journal line (matches the real engine's 2-event stream; implementation-reference §1.1)
export type JournalLine =
  | { type: 'started'; key: string; agentId: string }
  | { type: 'result'; key: string; agentId: string; result: AgentResult }

export interface Budget {
  total: number | null
  spent(): number
  remaining(): number
}

export interface WorkflowMeta {
  name: string
  description: string
  whenToUse?: string
  phases?: { title: string; detail?: string }[]
}

export interface RunState {
  ordinal: number
  chain: string
  agentCount: number
  currentPhase: string
  agentSeq: number
  tokensSpent: number
}

export interface RunContext {
  executor: Executor
  journal: import('./journal.js').Journal
  scheduler: import('./scheduler.js').Limiter
  budget: import('./budget.js').RunBudget
  args: unknown
  runId: string
  state: RunState
  signal: AbortSignal
  emit(ev: object): void
}

export const MAX_TOTAL_AGENTS = 1000
