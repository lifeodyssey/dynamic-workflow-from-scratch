export const meta = {
  name: 'review-changes',
  description: 'Review a set of changes, then adversarially verify each finding. Reasoning-only (no tools).',
  phases: [
    { title: 'Review', detail: 'pipeline each change through a reviewer' },
    { title: 'Verify', detail: 'a second agent judges whether each concern is real' },
  ],
}

const changes = (args && args.changes) || [
  'added a global mutable cache shared across requests',
  'removed the null check in parseUser()',
  'switched money math from integer cents to floating-point',
]

phase('Review')
const reviewed = await pipeline(changes, (change) =>
  agent(`Review this code change for bugs or risks, in 2 sentences: "${change}"`),
)

phase('Verify')
const verdicts = await parallel(
  reviewed.map((r) => () => agent(`A reviewer wrote:\n${r}\n\nIs this concern real and worth fixing? Answer YES or NO with one reason.`)),
)

return { changes: changes.length, reviewed, verdicts }
