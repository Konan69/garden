import { DateTime, Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import type { BrainToolOperations } from './agent-tools/brain'
import {
  BRAIN_AUDIT_SYSTEM_PROMPT,
  BRAIN_AUDIT_TOOL_NAMES,
  brainAuditToolContext,
  createBrainAuditMessage,
  createBrainAuditTools,
} from './brain-audit'

describe('brain audit prompt and tools', () => {
  it('instructs the agent to structure without an ontology or hard merges', () => {
    const message = createBrainAuditMessage({
      itemId: '42',
      text: 'Alice at Acme leads Project Atlas.',
    })

    expect(BRAIN_AUDIT_SYSTEM_PROMPT).toContain('ships no ontology')
    expect(BRAIN_AUDIT_SYSTEM_PROMPT).toContain('add_to_brain')
    expect(BRAIN_AUDIT_SYSTEM_PROMPT).toContain('brain_record_mention')
    expect(BRAIN_AUDIT_SYSTEM_PROMPT).toContain('Search the brain')
    expect(BRAIN_AUDIT_SYSTEM_PROMPT).toContain(
      'Use SAME_AS only for probable duplicates',
    )
    expect(BRAIN_AUDIT_SYSTEM_PROMPT).toContain('Never merge')
    expect(message).toContain('indexed brain item 42')
    expect(message).toContain('Alice at Acme leads Project Atlas.')
  })

  it('wires exactly the five authorized brain tools to item-scoped context', () => {
    const brain: BrainToolOperations = {
      ensureIndexes: () => Effect.void,
      search: () => Effect.succeed([]),
      addText: () => Effect.die('unused addText'),
      updateItemMetadata: (input) =>
        Effect.succeed({
          id: input.itemId,
          tenantId: input.tenantId,
          kind: input.kind,
          label: 'Atlas brief',
          summary: input.summary,
          indexed: true,
          origin: {
            actor: { _tag: 'Human', userId: 'user-1' },
            at: DateTime.makeUnsafe(new Date('2026-01-01T00:00:00Z')),
          },
          body: 'Alice at Acme leads Project Atlas.',
        }),
      recordMention: () => Effect.die('unused recordMention'),
      linkItems: () => Effect.die('unused linkItems'),
      neighborhood: () => Effect.die('unused neighborhood'),
    }
    const runInput = {
      workspaceId: 'workspace-1',
      agentId: 'agent-1',
      itemId: '42',
      text: 'Alice at Acme leads Project Atlas.',
    }
    const tools = createBrainAuditTools({
      env: {},
      ai: { run: async () => ({ data: [] }) },
      files: { get: async () => null },
      getContext: () => brainAuditToolContext(runInput),
      brain,
    })

    expect(Object.keys(tools)).toEqual([...BRAIN_AUDIT_TOOL_NAMES])
    expect(brainAuditToolContext(runInput)).toEqual({
      workspaceId: 'workspace-1',
      agentId: 'agent-1',
      runId: 'brain-audit:42',
    })
  })
})
