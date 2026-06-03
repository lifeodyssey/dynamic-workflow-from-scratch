import type { Plugin, PluginModule } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin'
import { readFileSync } from 'node:fs'
import { runWorkflow } from '../src/runner.js'
import { OpenCodeExecutor, type OpenCodeClient } from '../src/executor/opencode.js'

// Ship the engine into OpenCode: a plugin that exposes one tool to run a dynamic-workflow
// script, with each leaf agent() executed as an OpenCode sub-session (so leaves get real tools).
const server: Plugin = async (ctx) => {
  return {
    tool: {
      dwf_run_workflow: tool({
        description:
          'Run a from-scratch dynamic-workflow JS script (agent/parallel/pipeline) where each leaf agent runs as an OpenCode sub-session. Provide a file path or an inline script. Returns the workflow result as JSON.',
        args: {
          file: tool.schema.string().optional().describe('Path to a .workflow.js file'),
          script: tool.schema.string().optional().describe('Inline workflow script (alternative to file)'),
          model: tool.schema.string().optional().describe('provider/model for leaf agents, e.g. anthropic/claude-sonnet-4-6'),
        },
        async execute(args) {
          const source = (args.script && args.script.trim()) || (args.file ? readFileSync(args.file, 'utf8') : '')
          if (!source) return 'Provide either `file` (path to a .workflow.js) or `script` (inline).'
          const executor = new OpenCodeExecutor({
            client: ctx.client as unknown as OpenCodeClient,
            directory: ctx.directory,
            defaultModel: args.model,
          })
          const res = await runWorkflow(source, { executor })
          return `## ${res.meta.name}  (runId ${res.runId})\n\n\`\`\`json\n${JSON.stringify(res.result, null, 2)}\n\`\`\``
        },
      }),
    },
  }
}

export default { id: 'dynamic-workflow-from-scratch', server } satisfies PluginModule
export { server }
