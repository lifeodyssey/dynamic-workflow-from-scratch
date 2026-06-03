// A one-command demonstration of prefix-chained journaled resume.
//   npm run demo:resume
// Run a 4-step workflow cold, then edit step 3 and resume — watch only the edited
// step and everything downstream re-run, while the upstream steps are 0-token cache hits.
import { runWorkflow } from '../src/runner.js'
import { MockBackend } from '../src/executor/mock.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const runsDir = mkdtempSync(join(tmpdir(), 'dwf-resume-demo-'))

const V1 = `export const meta = { name: 'pipeline', description: 'four sequential steps' }
const a = await agent('step 1: gather sources')
const b = await agent('step 2: analyze them')
const c = await agent('step 3: draft the report')
const d = await agent('step 4: review the draft')
return [a, b, c, d].length`

function show(label: string, m: MockBackend, runId: string): void {
  const ran = m.calls.map((c) => c.prompt.replace(/^step \d+: /, ''))
  console.log(`\n[${label}]  runId=${runId}`)
  console.log(`  executed ${m.calls.length}/4 agents → ${JSON.stringify(ran)}`)
}

console.log('① cold run — journal is empty, so all four steps execute')
const m1 = new MockBackend()
const r1 = await runWorkflow(V1, { executor: m1, runsDir })
show('cold', m1, r1.runId)

console.log('\n② edit step 3 ("draft the report" → "draft the report v2") and resume from the cold run')
const V2 = V1.replace('step 3: draft the report', 'step 3: draft the report v2')
const m2 = new MockBackend()
const r2 = await runWorkflow(V2, { executor: m2, runsDir, resumeFromRunId: r1.runId })
show('resume', m2, r2.runId)

console.log('\n→ steps 1–2 were 0-token cache hits; step 3 (edited) and step 4 (downstream of it) re-ran.')
console.log('  This is the prefix-chained cascade: a change invalidates that call AND everything after it.')
