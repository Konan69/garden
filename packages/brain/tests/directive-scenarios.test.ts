import { DateTime, Effect } from 'effect'
import { expect, layer } from '@effect/vitest'
import { Kind, WorkspaceId } from '../src/domain/items.ts'
import type { NewBrainItem } from '../src/domain/items.ts'
import { FullLive } from '../src/layers.ts'
import { Brain } from '../src/services/Brain.ts'
import { PageIndex } from '../src/services/PageIndex.ts'
import { withTestConfig } from './helpers.ts'

const at = DateTime.makeUnsafe(new Date())

const humanActor = { _tag: 'Human' as const, userId: 'user-julian' }

const note = (
  workspaceId: WorkspaceId,
  overrides: Partial<NewBrainItem> = {},
): NewBrainItem => ({
  tenantId: workspaceId,
  kind: Kind.make('file'),
  label: 'meeting.md',
  body: 'placeholder body replaced by index extraction',
  r2Key: 'fixtures/meeting.md',
  canonical: { type: 'file', value: 'fixtures/meeting.md' },
  origin: { actor: humanActor, at },
  ...overrides,
})

layer(withTestConfig(FullLive), { excludeTestServices: true })(
  'directive scenarios',
  (it) => {
    it.effect(
      'M1/M2 answer-with-citation: hits carry cite that resolves to the real file',
      () =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make('ws-dir-cite')
          const brain = yield* Brain
          yield* brain.ensureIndexes()

          const added = yield* brain.addItem(note(workspaceId))
          yield* brain.index(added.id)

          const hits = yield* brain.search({
            tenantId: workspaceId,
            query: 'what did we agree with NITHub about the demo scope',
            k: 5,
          })
          expect(hits.length).toBeGreaterThan(0)
          const cited = hits.filter((hit) => hit.cite !== undefined)
          expect(cited.length).toBeGreaterThan(0)
          expect(cited.every((hit) => hit.cite === 'fixtures/meeting.md')).toBe(
            true,
          )

          const bytes = yield* brain.readFile(cited[0]!.item.id)
          const text = new TextDecoder().decode(bytes)
          expect(text).toContain('NITHub demo scope')
        }),
      120000,
    )

    it.effect(
      'M6 no near-duplicates: re-indexing never duplicates sections',
      () =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make('ws-dir-dedupe')
          const brain = yield* Brain
          const pageIndex = yield* PageIndex
          yield* brain.ensureIndexes()

          const pages = yield* pageIndex.load('fixtures/pages', workspaceId)
          const page = pages.find((p) => p.note.label === 'HelixDB Basics')
          if (page === undefined) throw new Error('missing fixture')

          const file = yield* brain.addItem(page.note)
          yield* brain.index(file.id)
          const firstSections = yield* brain.sectionsOf(file.id, workspaceId)
          const firstIds = firstSections.map((section) => section.id).sort()
          expect(firstIds.length).toBeGreaterThan(0)

          yield* brain.index(file.id)
          yield* brain.index(file.id)
          const afterReindex = yield* brain.sectionsOf(file.id, workspaceId)
          const afterIds = afterReindex.map((section) => section.id).sort()
          expect(afterIds).toEqual(firstIds)
          expect(afterIds.length).toBe(firstIds.length)
        }),
      120000,
    )

    it.effect(
      'M3 provenance: sections inherit fromItem and the uploader actor',
      () =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make('ws-dir-provenance')
          const brain = yield* Brain
          yield* brain.ensureIndexes()

          const file = yield* brain.addItem(note(workspaceId))
          yield* brain.index(file.id)

          const sections = yield* brain.sectionsOf(file.id, workspaceId)
          expect(sections.length).toBeGreaterThan(0)
          for (const section of sections) {
            expect(section.origin.fromItem).toBe(file.id)
            if (section.origin.actor._tag === 'Human') {
              expect(section.origin.actor.userId).toBe('user-julian')
            }
          }

          const loaded = yield* brain.read(file.id, workspaceId)
          expect(loaded?.origin.actor._tag).toBe('Human')
          if (loaded?.origin.actor._tag === 'Human') {
            expect(loaded.origin.actor.userId).toBe('user-julian')
          }
        }),
      120000,
    )

    it.effect(
      'M5 automation write-back: agent-authored items keep a runId badge and are searchable',
      () =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make(
            `ws-dir-automation-${crypto.randomUUID()}`,
          )
          const brain = yield* Brain
          yield* brain.ensureIndexes()

          const written = yield* brain.addText({
            tenantId: workspaceId,
            label: 'Brand decision',
            body:
              'the automation learned that brand guidelines mandate the solarpunk palette',
            kind: Kind.make('note'),
            summary: 'brand decision',
            actor: {
              _tag: 'Agent' as const,
              agentId: 'automation-runner',
              runId: 'run-42',
            },
          })
          expect(written.indexed).toBe(true)

          const loaded = yield* brain.read(written.id, workspaceId)
          expect(loaded?.origin.actor._tag).toBe('Agent')
          if (loaded?.origin.actor._tag === 'Agent') {
            expect(loaded.origin.actor.runId).toBe('run-42')
            expect(loaded.origin.actor.agentId).toBe('automation-runner')
          }

          let found = false
          for (let i = 0; i < 10 && !found; i++) {
            const hits = yield* brain.search({
              tenantId: workspaceId,
              query: 'solarpunk palette brand guidelines',
              k: 5,
            })
            found = hits.some((hit) => hit.item.id === written.id)
            if (!found && i < 9) yield* Effect.sleep(1000)
          }
          expect(found).toBe(true)
        }),
      120000,
    )

    it.effect(
      'two-moment ingest: index() gates section extraction, not raw body presence',
      () =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make(
            `ws-dir-twomoment-${crypto.randomUUID()}`,
          )
          const brain = yield* Brain
          yield* brain.ensureIndexes()

          const runKey = `fixtures/meeting.md#${crypto.randomUUID()}`
          const added = yield* brain.addItem(
            note(workspaceId, { canonical: { type: 'file', value: runKey } }),
          )
          expect(added.indexed).toBe(false)
          expect(added.body).toBe('placeholder body replaced by index extraction')

          const sectionsBefore = yield* brain.sectionsOf(added.id, workspaceId)
          expect(sectionsBefore.length).toBe(0)

          yield* brain.index(added.id)
          const after = yield* brain.read(added.id, workspaceId)
          expect(after?.indexed).toBe(true)
          expect(after?.body).toContain('NITHub demo scope')

          const sectionsAfter = yield* brain.sectionsOf(added.id, workspaceId)
          expect(sectionsAfter.length).toBeGreaterThan(0)

          let found = false
          for (let i = 0; i < 10 && !found; i++) {
            const hits = yield* brain.search({
              tenantId: workspaceId,
              query: 'NITHub demo scope',
              k: 5,
            })
            found = hits.some((hit) => hit.item.id === added.id)
            if (!found && i < 9) yield* Effect.sleep(1000)
          }
          expect(found).toBe(true)
        }),
      120000,
    )

    it.effect(
      'raw file access: readFile returns the source bytes and honors ranges',
      () =>
        Effect.gen(function* () {
          const workspaceId = WorkspaceId.make('ws-dir-raw')
          const brain = yield* Brain
          yield* brain.ensureIndexes()

          const added = yield* brain.addItem(note(workspaceId))
          yield* brain.index(added.id)

          const full = yield* brain.readFile(added.id)
          const text = new TextDecoder().decode(full)
          expect(text).toContain('NITHub')

          const range = yield* brain.readFile(added.id, {
            start: 0,
            end: 5,
          })
          expect(new TextDecoder().decode(range)).toBe('# NITH')
        }),
      120000,
    )
  },
)
