import { join } from 'node:path'
import { Journal } from './journal.js'

/**
 * Open the journal for a run. When `resumeFromRunId` is given, the new run writes its own
 * (delta) journal but is seeded with the prior run's cached results — so every `agent()` call
 * whose prefix-chained key is unchanged returns instantly (0 tokens), and the first edited/added
 * call onward re-runs live. Because the key is content-addressed (not tied to the runId),
 * a single edit cascades to that call and everything downstream. implementation-reference §1.1.
 */
export function openJournal(runsDir: string, runId: string, resumeFromRunId?: string): Journal {
  const path = join(runsDir, runId, 'journal.jsonl')
  const priorPath = resumeFromRunId ? join(runsDir, resumeFromRunId, 'journal.jsonl') : undefined
  return new Journal(path, priorPath)
}
