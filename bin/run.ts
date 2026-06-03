import { readFileSync, existsSync } from 'node:fs'
import { runWorkflow } from '../src/runner.js'
import { MockBackend } from '../src/executor/mock.js'
import { AnthropicBackend } from '../src/executor/anthropic.js'
import type { Executor } from '../src/types.js'

// Tiny dependency-free .env loader (gitignored). Missing file is fine; existing env wins.
function loadDotenv(path = '.env'): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || line.trimStart().startsWith('#')) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}
loadDotenv()

const argv = process.argv.slice(2)
const file = argv.find((a) => !a.startsWith('--'))
const mock = argv.includes('--mock')
const ri = argv.indexOf('--resume')
const resumeFromRunId = ri >= 0 ? argv[ri + 1] : undefined

if (!file) {
  console.error('usage: dwf <workflow.js> [--mock] [--resume <runId>]')
  process.exit(1)
}

const source = readFileSync(file, 'utf8')

let executor: Executor
if (mock) {
  executor = new MockBackend()
} else if (!process.env.ANTHROPIC_API_KEY) {
  console.error('set ANTHROPIC_API_KEY to run the real backend (or pass --mock for a 0-token run)')
  process.exit(1)
} else {
  executor = new AnthropicBackend()
}

const res = await runWorkflow(source, { executor, resumeFromRunId })
const agents = res.events.filter((e: any) => e.ev === 'agent')
const ran = agents.filter((e: any) => e.done).length
const cached = agents.filter((e: any) => e.cached).length
const tokens = agents.reduce((sum: number, e: any) => sum + (e.outputTokens ?? 0), 0)

console.log(`\n=== ${res.meta.name}  (runId ${res.runId}) ===`)
console.log('result:', JSON.stringify(res.result, null, 2))
console.log(`agents: ${ran} ran, ${cached} cached — ${mock ? '0 tokens (mock backend)' : `${tokens} output tokens`}`)
