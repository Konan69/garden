import { Effect, ManagedRuntime } from 'effect'
import { Kind, WorkspaceId } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import { makeWorkerBrainLive } from '@garden/brain/services/worker'

const stubAi = {
  run: async (model, input) => {
    if (model !== '@cf/baai/bge-small-en-v1.5') throw new Error(`unexpected model ${model}`)
    const texts = Array.isArray(input?.text) ? input.text : [input?.text ?? '']
    return { data: texts.map((t) => Array.from({ length: 384 }, (_, i) => (i + (t?.length ?? 0)) / 384)) }
  },
}
const stubFiles = { get: async () => null }

const runtime = ManagedRuntime.make(
  makeWorkerBrainLive({ baseUrl: 'http://localhost:6968', apiKey: '', ai: stubAi, files: stubFiles }),
)

const tenantId = WorkspaceId.make('smoke-ws')

const added = await runtime.runPromise(Effect.gen(function* () {
  const brain = yield* Brain
  return yield* brain.addText({
    tenantId,
    label: 'smoke test note',
    body: 'the garden org brain worker smoke test writes this note',
    kind: Kind.make('note'),
    summary: 'smoke',
    actor: { _tag: 'Agent', agentId: 'smoke-agent', runId: 'smoke-run' },
  })
}))
console.log('added:', { id: added.id, indexed: added.indexed, kind: added.kind, label: added.label })

const hits = await runtime.runPromise(Effect.gen(function* () {
  const brain = yield* Brain
  return yield* brain.search({ tenantId, query: 'garden brain smoke', k: 3 })
}))
console.log('hits:', hits.length)
for (const h of hits) console.log('  hit:', { id: h.item.id, label: h.item.label, kind: h.item.kind, score: h.score, cite: h.cite })

await runtime.dispose()
