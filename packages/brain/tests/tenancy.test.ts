import { DateTime, Effect, Layer } from 'effect'
import { expect, layer } from '@effect/vitest'
import { Kind, WorkspaceId } from '../src/domain/items.ts'
import type { NewBrainItem } from '../src/domain/items.ts'
import { BrainLive, PageIndexLiveLayer } from '../src/layers.ts'
import { Brain } from '../src/services/Brain.ts'
import { PageIndex } from '../src/services/PageIndex.ts'
import { withTestConfig } from './helpers.ts'

const workspaceA = WorkspaceId.make('ws-tenancy-a')
const workspaceB = WorkspaceId.make('ws-tenancy-b')

const at = DateTime.makeUnsafe(new Date())

const note = (workspaceId: WorkspaceId, label: string, body: string): NewBrainItem => ({
  tenantId: workspaceId,
  kind: Kind.make('file'),
  label,
  body,
  origin: { actor: { _tag: 'Human' as const, userId: 'test' }, at },
})

const section = (workspaceId: WorkspaceId, label: string, body: string): NewBrainItem => ({
  tenantId: workspaceId,
  kind: Kind.make('section'),
  label,
  body,
  origin: { actor: { _tag: 'Human' as const, userId: 'test' }, at },
})

const TenancyLive = withTestConfig(
  Layer.mergeAll(BrainLive, PageIndexLiveLayer),
)

layer(TenancyLive, { excludeTestServices: true })('tenancy', (it) => {
  it.effect(
    'add, read, sectionsOf and linkSections never leak across workspaces',
    () =>
      Effect.gen(function* () {
        const brain = yield* Brain
        const alphaNote = yield* brain.addItem(
          note(
            workspaceA,
            'Acme Strategy',
            'The acme corporate strategy is to expand into the solarpunk energy market with unified brand messaging.',
          ),
        )
        const betaNote = yield* brain.addItem(
          note(
            workspaceB,
            'Acme Strategy',
            'The acme corporate strategy is to expand into the solarpunk energy market with unified brand messaging.',
          ),
        )
        expect(alphaNote.id).not.toBe(betaNote.id)

        const alphaSection = yield* brain.addItem(
          section(
            workspaceA,
            'Acme roadmap',
            'Acme quarterly roadmap focuses on customer research for the solarpunk line.',
          ),
        )
        const betaSection = yield* brain.addItem(
          section(
            workspaceB,
            'Acme roadmap',
            'Acme quarterly roadmap focuses on customer research for the solarpunk line.',
          ),
        )
        yield* brain.linkSections(alphaNote.id, [alphaSection.id], workspaceA)
        yield* brain.linkSections(betaNote.id, [betaSection.id], workspaceB)

        const alphaSections = yield* brain.sectionsOf(alphaNote.id, workspaceA)
        expect(alphaSections.map((item) => item.id)).toContain(alphaSection.id)
        expect(alphaSections.map((item) => item.id)).not.toContain(betaSection.id)

        const betaSections = yield* brain.sectionsOf(betaNote.id, workspaceB)
        expect(betaSections.map((item) => item.id)).toContain(betaSection.id)
        expect(betaSections.map((item) => item.id)).not.toContain(alphaSection.id)

        const alphaRead = yield* brain.read(alphaNote.id, workspaceA)
        const alphaFromBeta = yield* brain.read(alphaNote.id, workspaceB)
        const betaRead = yield* brain.read(betaNote.id, workspaceB)
        const betaFromAlpha = yield* brain.read(betaNote.id, workspaceA)
        expect(alphaRead?.label).toBe('Acme Strategy')
        expect(betaRead?.label).toBe('Acme Strategy')
        expect(alphaFromBeta).toBeNull()
        expect(betaFromAlpha).toBeNull()
      }),
    120000,
  )

  it.effect(
    'search and indexed sections never leak across workspaces',
    () =>
      Effect.gen(function* () {
        const brain = yield* Brain
        const pageIndex = yield* PageIndex
        yield* brain.ensureIndexes()

        const loadAndIndex = (workspaceId: WorkspaceId) =>
          Effect.gen(function* () {
            const pages = yield* pageIndex.load('fixtures/pages', workspaceId)
            for (const page of pages) {
              const file = yield* brain.addItem(page.note)
              yield* brain.index(file.id)
            }
          })
        yield* loadAndIndex(workspaceA)
        yield* loadAndIndex(workspaceB)

        const searchA = yield* brain.search({
          tenantId: workspaceA,
          query: 'graph database',
          k: 10,
        })
        const searchB = yield* brain.search({
          tenantId: workspaceB,
          query: 'graph database',
          k: 10,
        })
        expect(searchA.length).toBeGreaterThan(0)
        expect(searchB.length).toBeGreaterThan(0)
        expect(searchA.every((hit) => hit.item.tenantId === workspaceA)).toBe(true)
        expect(searchB.every((hit) => hit.item.tenantId === workspaceB)).toBe(true)

        const topA = searchA[0]?.item
        const topB = searchB[0]?.item
        if (topA === undefined || topB === undefined) {
          throw new Error('search returned no hits')
        }
        const fileA = yield* brain.read(topA.id, workspaceA)
        const fileB = yield* brain.read(topB.id, workspaceB)
        expect(fileA?.tenantId).toBe(workspaceA)
        expect(fileB?.tenantId).toBe(workspaceB)
        expect(fileA?.label).toBe('HelixDB Basics')
        expect(fileB?.label).toBe('HelixDB Basics')
      }),
    120000,
  )

  it.effect(
    'treats identical canonical keys across workspaces as separate items',
    () =>
      Effect.gen(function* () {
        const brain = yield* Brain
        const shared = { type: 'file' as const, value: 'shared.md' }
        const idA = yield* brain.addItem({
          ...note(workspaceA, 'Shared Doc', 'body of a shared doc'),
          canonical: shared,
        })
        const idB = yield* brain.addItem({
          ...note(workspaceB, 'Shared Doc', 'body of a shared doc'),
          canonical: shared,
        })
        expect(idA.id).not.toBe(idB.id)

        const againA = yield* brain.addItem({
          ...note(workspaceA, 'Shared Doc', 'body of a shared doc'),
          canonical: shared,
        })
        expect(againA.id).toBe(idA.id)
        const againB = yield* brain.addItem({
          ...note(workspaceB, 'Shared Doc', 'body of a shared doc'),
          canonical: shared,
        })
        expect(againB.id).toBe(idB.id)

        const readA = yield* brain.read(idA.id, workspaceA)
        const readAFromB = yield* brain.read(idA.id, workspaceB)
        expect(readA?.tenantId).toBe(workspaceA)
        expect(readAFromB).toBeNull()
      }),
    120000,
  )
})
