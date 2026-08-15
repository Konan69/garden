import { NodeFileSystem } from '@effect/platform-node'
import { DateTime, Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { expect, layer } from '@effect/vitest'
import { Brain } from '../src/services/Brain.ts'
import { Kind, WorkspaceId } from '../src/domain/items.ts'
import type { NewBrainItem } from '../src/domain/items.ts'
import { BrainLive } from '../src/layers.ts'
import { withTestConfig } from './helpers.ts'

const workspaceId = WorkspaceId.make(`ws-brain-${crypto.randomUUID()}`)

const at = DateTime.makeUnsafe(new Date())

const note = (overrides: Partial<NewBrainItem> = {}): NewBrainItem => ({
  tenantId: workspaceId,
  kind: Kind.make('file'),
  label: 'hello',
  body: 'hello world',
  origin: { actor: { _tag: 'Human' as const, userId: 'test' }, at },
  ...overrides,
})

const BrainTestLive = Layer.merge(
  withTestConfig(BrainLive),
  NodeFileSystem.layer,
)

layer(BrainTestLive, { excludeTestServices: true })('brain', (it) => {
  it.effect('adds and reads a brain item', () =>
    Effect.gen(function* () {
      const brain = yield* Brain
      const added = yield* brain.addItem(note())
      expect(added.indexed).toBe(false)
      expect(added.label).toBe('hello')
      expect(added.tenantId).toBe(workspaceId)

      const loaded = yield* brain.read(added.id, workspaceId)
      expect(loaded?.body).toBe('hello world')
      expect(loaded?.kind).toBe(Kind.make('file'))
    }),
  )

  it.effect('treats canonical duplicates as the same item', () =>
    Effect.gen(function* () {
      const brain = yield* Brain
      const first = yield* brain.addItem(
        note({ canonical: { type: 'file', value: 'shared.md' } }),
      )
      const second = yield* brain.addItem(
        note({ canonical: { type: 'file', value: 'shared.md' } }),
      )
      expect(second.id).toBe(first.id)
      expect(second.tenantId).toBe(first.tenantId)
    }),
  )

  it.effect('rejects reads from a different tenant', () =>
    Effect.gen(function* () {
      const brain = yield* Brain
      const added = yield* brain.addItem(note())
      const other = yield* brain.read(added.id, WorkspaceId.make('ws-other'))
      expect(other).toBeNull()
    }),
  )

  it.effect(
    'addText items are searchable regardless of the free-text kind',
    () =>
      Effect.gen(function* () {
        const brain = yield* Brain
        yield* brain.ensureIndexes()
        const added = yield* brain.addText({
          tenantId: workspaceId,
          label: 'Solarpunk decision',
          body: 'the team agreed on unified brand messaging for the solarpunk line',
          kind: Kind.make('decision'),
          summary: 'brand decision',
          actor: {
            _tag: 'Agent' as const,
            agentId: 'test-agent',
            runId: 'test-run',
          },
        })
        expect(added.kind).toBe(Kind.make('decision'))
        expect(added.indexed).toBe(true)

        const hits = yield* brain.search({
          tenantId: workspaceId,
          query: 'solarpunk brand messaging',
          k: 5,
        })
        expect(hits.some((hit) => hit.item.id === added.id)).toBe(true)
        const hit = hits.find((h) => h.item.id === added.id)
        expect(hit?.item.kind).toBe(Kind.make('decision'))
        expect(hit?.score).toBeGreaterThan(0)
        expect(hit?.score).toBeLessThanOrEqual(6 / 51)
      }),
    120000,
  )

  it.effect(
    'invalidates changed content and removes stale sections on re-index',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const brain = yield* Brain
          const fs = yield* FileSystem
          yield* brain.ensureIndexes()

          const path = yield* fs.makeTempFileScoped({
            prefix: 'garden-brain-reindex-',
            suffix: '.md',
          })
          yield* fs.writeFileString(
            path,
            [
              '## Alpha',
              'shared reindex marker alpha',
              '## Beta',
              'shared reindex marker beta',
              '## Gamma',
              'shared reindex marker gamma',
            ].join('\n'),
          )

          const item: NewBrainItem = {
            tenantId: workspaceId,
            kind: Kind.make('file'),
            label: 'reindex.md',
            canonical: { type: 'file', value: path },
            origin: {
              actor: { _tag: 'Human' as const, userId: 'test' },
              at,
            },
          }
          const added = yield* brain.addItem(item)
          const firstIndex = yield* brain.index(added.id)
          expect(firstIndex.indexed).toBe(true)
          expect(
            (yield* brain.sectionsOf(added.id, workspaceId))
              .map((section) => section.label)
              .sort(),
          ).toEqual(['Alpha', 'Beta', 'Gamma'])

          yield* fs.writeFileString(
            path,
            [
              '## Alpha',
              'shared reindex marker updated alpha',
              '## Beta',
              'shared reindex marker updated beta',
            ].join('\n'),
          )
          const updated = yield* brain.addItem({
            ...item,
            body: 'content changed before deferred indexing',
          })
          expect(updated.id).toBe(added.id)
          expect(updated.indexed).toBe(false)

          yield* brain.index(updated.id)
          const sections = yield* brain.sectionsOf(updated.id, workspaceId)
          expect(sections.map((section) => section.label).sort()).toEqual([
            'Alpha',
            'Beta',
          ])

          const hits = yield* brain.search({
            tenantId: workspaceId,
            query: 'shared reindex marker updated',
            k: 10,
          })
          expect(
            hits
              .filter((hit) => hit.item.kind === Kind.make('section'))
              .map((hit) => hit.item.label)
              .sort(),
          ).toEqual(['Alpha', 'Beta'])
        }),
      ),
    120000,
  )
})
