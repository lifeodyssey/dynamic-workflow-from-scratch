export const meta = {
  name: 'mini-research',
  description: 'Fan out a question across angles, then synthesize. Reasoning-only (no tools) — runs on the mock or any LLM leaf.',
  phases: [
    { title: 'Explore', detail: 'one agent per angle, in parallel' },
    { title: 'Synthesize', detail: 'fold the notes into one answer' },
  ],
}

const topic = (args && args.topic) || 'dynamic workflows'
const ANGLES = ['technical', 'historical', 'economic', 'risks']

phase('Explore')
const notes = await parallel(
  ANGLES.map((angle) => () => agent(`In 2-3 sentences, analyze "${topic}" from a ${angle} angle.`)),
)

phase('Synthesize')
const synthesis = await agent(`Synthesize these notes into one paragraph:\n\n${notes.join('\n\n')}`)

log(`explored ${ANGLES.length} angles`)
return { topic, angles: ANGLES.length, synthesis }
