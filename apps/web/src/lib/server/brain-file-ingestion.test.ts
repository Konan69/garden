// @vitest-environment node
import { DateTime, Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemId, Kind, WorkspaceId, type BrainItem } from '@garden/brain/domain'
import type { AppEnv } from '@/lib/server/env'
import { runDeferredBrainIndexAndAudit } from './brain-file-ingestion'

const mockEnsureAgentRow = vi.hoisted(() => vi.fn())
const mockGetAgentByName = vi.hoisted(() => vi.fn())
const mockGetDb = vi.hoisted(() => vi.fn())
const mockLogError = vi.hoisted(() => vi.fn())
const mockStartBrainAudit = vi.hoisted(() => vi.fn())

vi.mock('agents', () => ({ getAgentByName: mockGetAgentByName }))

vi.mock('@/lib/server/chat-agents', () => ({
  ensureAgentRow: mockEnsureAgentRow,
}))

vi.mock('@/lib/server/db', () => ({ getDb: mockGetDb }))

vi.mock('@garden/observability/logger', () => ({
  createGardenLogger: () => ({ error: mockLogError }),
  errorFields: (cause: unknown) => ({
    message: cause instanceof Error ? cause.message : String(cause),
  }),
}))

const indexedItem = {
  id: ItemId.make('item-42'),
  tenantId: WorkspaceId.make('workspace-1'),
  kind: Kind.make('file'),
  label: 'atlas.txt',
  indexed: true,
  origin: {
    actor: { _tag: 'Human' as const, userId: 'user-1' },
    at: DateTime.makeUnsafe(new Date('2026-01-01T00:00:00Z')),
  },
  body: 'Alice at Acme leads Project Atlas.',
} as BrainItem

const agentDo = {} as AppEnv['AgentDO']
const hyperdrive = {} as AppEnv['HYPERDRIVE']

describe('deferred brain indexing audit trigger', () => {
  beforeEach(() => {
    mockEnsureAgentRow.mockReset().mockResolvedValue({
      id: 'agent-1',
      hostName: 'agent-host-1',
    })
    mockGetAgentByName.mockReset().mockResolvedValue({
      startBrainAudit: mockStartBrainAudit,
    })
    mockGetDb.mockReset().mockResolvedValue({ id: 'db' })
    mockLogError.mockReset()
    mockStartBrainAudit
      .mockReset()
      .mockResolvedValue({ ok: true, status: 'completed' })
  })

  it('calls the workspace AgentDO only after indexing succeeds', async () => {
    await runDeferredBrainIndexAndAudit({
      env: { AgentDO: agentDo, HYPERDRIVE: hyperdrive },
      indexEffect: Effect.succeed(indexedItem),
      itemId: 'item-42',
      ownerUserId: 'user-1',
      workspaceId: 'workspace-1',
    })

    expect(mockEnsureAgentRow).toHaveBeenCalledWith({
      db: { id: 'db' },
      ownerUserId: 'user-1',
      workspaceId: 'workspace-1',
    })
    expect(mockGetAgentByName).toHaveBeenCalledWith(agentDo, 'agent-host-1', {
      routingRetry: { maxAttempts: 3 },
    })
    expect(mockStartBrainAudit).toHaveBeenCalledWith({
      itemId: 'item-42',
      text: 'Alice at Acme leads Project Atlas.',
      workspaceId: 'workspace-1',
    })
  })

  it('does not call the AgentDO when indexing fails', async () => {
    await runDeferredBrainIndexAndAudit({
      env: { AgentDO: agentDo, HYPERDRIVE: hyperdrive },
      indexEffect: Effect.fail(new Error('index failed')),
      itemId: 'item-42',
      ownerUserId: 'user-1',
      workspaceId: 'workspace-1',
    })

    expect(mockGetAgentByName).not.toHaveBeenCalled()
    expect(mockLogError).toHaveBeenCalledWith(
      'brain file deferred indexing failed',
      expect.objectContaining({ message: 'index failed' }),
    )
  })

  it('logs AgentDO failures without rejecting the deferred task', async () => {
    mockStartBrainAudit.mockRejectedValueOnce(new Error('model unavailable'))

    await expect(
      runDeferredBrainIndexAndAudit({
        env: { AgentDO: agentDo, HYPERDRIVE: hyperdrive },
        indexEffect: Effect.succeed(indexedItem),
        itemId: 'item-42',
        ownerUserId: 'user-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toBeUndefined()
    expect(mockLogError).toHaveBeenCalledWith(
      'brain file deferred audit failed',
      expect.objectContaining({
        itemId: 'item-42',
        message: 'model unavailable',
      }),
    )
  })
})
