import { getAgentByName } from 'agents'
import { disposeRpcResult } from '@garden/app-state/platform/rpc'
import type { AppEnv } from '@/lib/server/env'

type BrainAuditAgentStub = {
  startBrainAudit(input: {
    itemId: string
    text: string
    workspaceId: string
  }): Promise<{ ok: true; status: 'completed' }>
}

const AGENT_ROUTING_RETRY = { maxAttempts: 3 }

/**
 * Calls the workspace AgentDO's one-shot brain-audit RPC. Before static
 * ingestion had no agent boundary; after indexing, the web Worker uses the
 * Agents SDK's documented `getAgentByName` callable-RPC path with the same
 * bounded routing retry and RPC-result disposal used by chat runtime helpers.
 */
export async function requestBrainAudit(input: {
  agentDo: AppEnv['AgentDO']
  hostName: string
  itemId: string
  text: string
  workspaceId: string
}): Promise<{ ok: true; status: 'completed' }> {
  const stub = (await getAgentByName(input.agentDo, input.hostName, {
    routingRetry: AGENT_ROUTING_RETRY,
  })) as unknown as BrainAuditAgentStub

  return disposeRpcResult(
    await stub.startBrainAudit({
      itemId: input.itemId,
      text: input.text,
      workspaceId: input.workspaceId,
    }),
  )
}
