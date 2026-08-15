import { Effect } from 'effect'
import { Result } from 'better-result'
import type { BrainItem } from '@garden/brain/domain'
import { createGardenLogger, errorFields } from '@garden/observability/logger'
import { ensureAgentRow } from '@/lib/server/chat-agents'
import { getDb } from '@/lib/server/db'
import type { AppEnv } from '@/lib/server/env'
import { requestBrainAudit } from '@/lib/server/brain-audit-runtime'

const brainIngestionLogger = createGardenLogger({
  service: 'garden-staging',
  component: 'brain-ingestion',
})

/**
 * Completes mechanical indexing, then asks the workspace agent to structure
 * the extracted document. Before the upload's deferred task ended at Helix
 * indexing; after success it resolves the default workspace AgentDO and calls
 * its ephemeral audit facet with the indexed body. `Result.tryPromise` keeps
 * both index and RPC failures best-effort and visible in logs without adding a
 * queue, workflow, retry loop, or recovery mechanism.
 */
export async function runDeferredBrainIndexAndAudit(input: {
  env: Pick<AppEnv, 'AgentDO' | 'HYPERDRIVE'>
  indexEffect: Effect.Effect<BrainItem, unknown>
  itemId: string
  ownerUserId: string
  workspaceId: string
}): Promise<void> {
  const indexResult = await Result.tryPromise({
    try: async () => await Effect.runPromise(input.indexEffect),
    catch: (cause) => cause,
  })
  if (indexResult.isErr()) {
    brainIngestionLogger.error('brain file deferred indexing failed', {
      itemId: input.itemId,
      workspaceId: input.workspaceId,
      ...errorFields(indexResult.error),
    })
    return
  }

  const indexed = indexResult.value
  if (indexed.body === undefined) {
    brainIngestionLogger.error('brain file deferred audit failed', {
      itemId: indexed.id,
      workspaceId: input.workspaceId,
      message: 'Indexed brain item has no extracted body',
    })
    return
  }
  const extractedText = indexed.body

  const auditResult = await Result.tryPromise({
    try: async () => {
      const agent = await ensureAgentRow({
        db: await getDb(input.env),
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
      })
      return await requestBrainAudit({
        agentDo: input.env.AgentDO,
        hostName: agent.hostName ?? agent.id,
        itemId: indexed.id,
        text: extractedText,
        workspaceId: input.workspaceId,
      })
    },
    catch: (cause) => cause,
  })
  auditResult.tapError((cause) => {
    brainIngestionLogger.error('brain file deferred audit failed', {
      itemId: indexed.id,
      workspaceId: input.workspaceId,
      ...errorFields(cause),
    })
  })
}
