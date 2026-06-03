import { readFileSync } from 'node:fs'
import { runWorkflow } from '../src/runner.js'
import { MockBackend } from '../src/executor/mock.js'

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

if (!mock) {
  console.error('The real (Anthropic) backend lands in a later step. Run with --mock for now.')
  process.exit(1)
}

const res = await runWorkflow(source, { executor: new MockBackend(), resumeFromRunId })
const agents = res.events.filter((e: any) => e.ev === 'agent')
const ran = agents.filter((e: any) => e.done).length
const cached = agents.filter((e: any) => e.cached).length

console.log(`\n=== ${res.meta.name}  (runId ${res.runId}) ===`)
console.log('result:', JSON.stringify(res.result, null, 2))
console.log(`agents: ${ran} ran, ${cached} cached — 0 tokens (mock backend)`)
