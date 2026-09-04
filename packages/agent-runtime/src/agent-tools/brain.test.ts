import { DateTime, Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { ItemId, Kind } from '@garden/brain/domain'
import { createBrainTools, type BrainToolOperations } from './brain'

const execute = async (
  tool: { execute?: (input: never, options: never) => unknown } | undefined,
  input: unknown,
) =>
  (await tool?.execute?.(
    input as never,
    {
      toolCallId: 'call-1',
      messages: [],
    } as never,
  )) as Record<string, unknown>

describe('createBrainTools', () => {
  it('round-trips an agent-invented free-text kind through add_to_brain', async () => {
    let receivedKind: Kind | undefined
    const brain: BrainToolOperations = {
      ensureIndexes: () => Effect.void,
      search: () => Effect.succeed([]),
      addText: (input) => {
        receivedKind = input.kind
        return Effect.succeed({
          id: ItemId.make('42'),
          tenantId: input.tenantId,
          kind: input.kind ?? Kind.make('note'),
          label: input.label,
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          indexed: true,
          origin: {
            actor: input.actor,
            at: DateTime.makeUnsafe(new Date('2026-01-01T00:00:00Z')),
          },
          body: input.body,
        })
      },
      updateItemMetadata: () => Effect.die('unused updateItemMetadata'),
      observeMention: () => Effect.die('unused observeMention'),
      linkItems: () => Effect.die('unused linkItems'),
      neighborhood: () => Effect.die('unused neighborhood'),
    }
    const tools = createBrainTools({
      env: {},
      ai: { run: async () => ({ data: [] }) },
      files: { get: async () => null },
      getContext: () => ({
        workspaceId: 'workspace-1',
        agentId: 'agent-1',
        runId: 'run-1',
      }),
      brain,
    })

    expect(Object.keys(tools).sort()).toEqual([
      'add_to_brain',
      'brain_link',
      'brain_neighborhood',
      'brain_observe_mention',
      'brain_search',
    ])
    const result = await execute(tools.add_to_brain, {
      label: 'Network steward',
      content: 'Alice maintains partner relationships.',
      kind: 'relationship-steward',
    })

    expect(receivedKind).toBe(Kind.make('relationship-steward'))
    expect(result).toMatchObject({
      ok: true,
      id: ItemId.make('42'),
      kind: Kind.make('relationship-steward'),
    })
  })

  it('updates an indexed item through add_to_brain without ensuring indexes', async () => {
    let metadataInput:
      | {
          itemId: ItemId
          kind: Kind
          summary: string
        }
      | undefined
    let ensureCount = 0
    const brain: BrainToolOperations = {
      ensureIndexes: () => {
        ensureCount += 1
        return Effect.void
      },
      search: () => Effect.succeed([]),
      addText: () => Effect.die('unused addText'),
      updateItemMetadata: (input) => {
        metadataInput = input
        return Effect.succeed({
          id: input.itemId,
          tenantId: input.tenantId,
          kind: input.kind,
          label: 'Acme brief',
          summary: input.summary,
          indexed: true,
          origin: {
            actor: { _tag: 'Human', userId: 'user-1' },
            at: DateTime.makeUnsafe(new Date('2026-01-01T00:00:00Z')),
          },
          body: 'Acme and Alice are launching Atlas.',
        })
      },
      observeMention: () => Effect.die('unused observeMention'),
      linkItems: () => Effect.die('unused linkItems'),
      neighborhood: () => Effect.die('unused neighborhood'),
    }
    const tools = createBrainTools({
      env: {},
      ai: { run: async () => ({ data: [] }) },
      files: { get: async () => null },
      getContext: () => ({
        workspaceId: 'workspace-1',
        agentId: 'agent-1',
        runId: 'brain-audit:42',
      }),
      brain,
    })

    const result = await execute(tools.add_to_brain, {
      itemId: '42',
      kind: 'partner-brief',
      summary: 'Acme partnership brief naming Alice and Atlas.',
    })

    expect(metadataInput).toMatchObject({
      itemId: ItemId.make('42'),
      kind: Kind.make('partner-brief'),
      summary: 'Acme partnership brief naming Alice and Atlas.',
    })
    expect(ensureCount).toBe(0)
    expect(result).toMatchObject({
      ok: true,
      id: ItemId.make('42'),
      kind: Kind.make('partner-brief'),
      indexed: true,
    })
  })
})
