import type { QueryRequest } from '@helix-db/helix-db'
import { Effect } from 'effect'
import { expect, it } from '@effect/vitest'
import { EDGES } from '../src/helix/constants.ts'
import { ItemId, Kind, WorkspaceId } from '../src/domain/items.ts'
import { makeBrain } from '../src/services/Brain.ts'
import { Chunker } from '../src/services/Chunker.ts'
import { Embeddings } from '../src/services/Embeddings.ts'
import { Extractor } from '../src/services/ExtractorService.ts'
import {
  HelixClient,
  type QueryResponse,
  type RunOptions,
} from '../src/services/HelixClient.ts'
import { RawFileStore } from '../src/services/RawFileStore.ts'

const tenantId = WorkspaceId.make('ws-graph')
const storedOrigin = JSON.stringify({
  actor: { _tag: 'Human', userId: 'test-user' },
  at: '2026-01-01T00:00:00.000Z',
})

const itemRow = (id: number, label: string, kind = 'decision') => ({
  $id: id,
  workspace_id: tenantId,
  kind,
  label,
  indexed: false,
  origin: storedOrigin,
})

type HelixCall = {
  readonly request: QueryRequest
  readonly options?: RunOptions
}

/**
 * Builds the real Brain implementation over a deterministic Helix adapter.
 * Before these tests, graph methods had no isolated seam; responses can now be
 * scripted while assertions inspect the exact pinned-SDK request AST.
 */
const testBrain = (
  respond: (request: QueryRequest) => QueryResponse,
  calls: HelixCall[],
) =>
  makeBrain.pipe(
    Effect.provideService(
      HelixClient,
      HelixClient.of({
        run: (request, options) => {
          calls.push({
            request,
            ...(options === undefined ? {} : { options }),
          })
          return Effect.succeed(respond(request))
        },
      }),
    ),
    Effect.provideService(
      Embeddings,
      Embeddings.of({ dim: 384, embed: () => Effect.succeed([]) }),
    ),
    Effect.provideService(
      Chunker,
      Chunker.of({ chunk: () => Effect.succeed([]) }),
    ),
    Effect.provideService(
      Extractor,
      Extractor.of({
        extract: () => Effect.die('unused extractor'),
        extractFromBytes: () => Effect.die('unused extractor'),
      }),
    ),
    Effect.provideService(
      RawFileStore,
      RawFileStore.of({ read: () => Effect.die('unused file store') }),
    ),
  )

it.effect('records an append-only mention observation on its source edge', () =>
  Effect.gen(function* () {
    const calls: HelixCall[] = []
    const brain = yield* testBrain(
      () => ({
        source: [itemRow(1, 'Source')],
        recorded: [itemRow(1, 'Source')],
      }),
      calls,
    )
    const observation = yield* brain.observeMention({
      tenantId,
      itemId: ItemId.make('1'),
      span: { start: 12, end: 18 },
      text: 'Garden',
      actor: { _tag: 'Agent', agentId: 'agent-1', runId: 'run-1' },
    })

    expect(observation.text).toBe('Garden')
    expect(observation.span).toEqual({ start: 12, end: 18 })
    expect(observation.origin.fromItem).toBe(ItemId.make('1'))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.options?.awaitDurability).toBe(true)
    const request = calls[0]?.request.toJsonString() ?? ''
    expect(request).toContain('"query_name":"brain.observe_mention"')
    expect(request).toContain('"add_e"')
    expect(request).toContain('"label":"MENTIONS"')
    expect(request).toContain('"mention_text"')
    expect(request).not.toContain('"add_n"')
  }),
)

it.effect(
  'updates audit metadata without invalidating indexed source content',
  () =>
    Effect.gen(function* () {
      const calls: HelixCall[] = []
      const indexedRow = {
        ...itemRow(1, 'Partner brief', 'partner-brief'),
        summary: 'Acme partnership plan and named owners.',
        indexed: true,
        body: 'Acme and Alice will launch the Atlas project.',
      }
      const brain = yield* testBrain(
        (request) =>
          request.toJsonString().includes('brain.update_item_metadata')
            ? { updated: [indexedRow] }
            : { item: [indexedRow] },
        calls,
      )

      const updated = yield* brain.updateItemMetadata({
        tenantId,
        itemId: ItemId.make('1'),
        kind: Kind.make('partner-brief'),
        summary: 'Acme partnership plan and named owners.',
      })

      expect(updated.kind).toBe(Kind.make('partner-brief'))
      expect(updated.summary).toBe('Acme partnership plan and named owners.')
      expect(updated.indexed).toBe(true)
      expect(updated.body).toBe('Acme and Alice will launch the Atlas project.')
      expect(calls).toHaveLength(2)
      expect(calls[0]?.options?.awaitDurability).toBe(true)
      const request = calls[0]?.request.toJsonString() ?? ''
      expect(request).toContain('"query_name":"brain.update_item_metadata"')
      expect(request).toContain('"name":"kind"')
      expect(request).toContain('"name":"summary"')
      expect(request).not.toContain('"name":"indexed"')
      expect(request).not.toContain('"name":"body"')
      expect(request).not.toContain('"name":"embedding"')
    }),
)

it.effect(
  'links existing items with fixed and agent-invented edge labels',
  () =>
    Effect.gen(function* () {
      const calls: HelixCall[] = []
      const brain = yield* testBrain(
        () => ({
          from: [itemRow(1, 'From')],
          to: [itemRow(2, 'To')],
          created: [itemRow(1, 'From')],
        }),
        calls,
      )
      const labels = [
        EDGES.hasSection,
        EDGES.mentions,
        EDGES.sameAs,
        'CONTRADICTS',
      ]

      for (const edge of labels) {
        const linked = yield* brain.linkItems({
          tenantId,
          from: ItemId.make('1'),
          to: ItemId.make('2'),
          edge,
          actor: { _tag: 'Agent', agentId: 'agent-1', runId: 'run-1' },
        })
        expect(linked).toEqual({
          from: ItemId.make('1'),
          to: ItemId.make('2'),
          edge,
          created: true,
        })
      }

      expect(calls).toHaveLength(labels.length)
      labels.forEach((edge, index) => {
        const request = calls[index]?.request.toJsonString() ?? ''
        expect(request).toContain('"query_name":"brain.link_items"')
        expect(request).toContain(`"label":"${edge}"`)
        expect(request).toContain('"without"')
      })
    }),
)

it.effect(
  'returns a deduplicated bounded two-hop neighborhood with mentions',
  () =>
    Effect.gen(function* () {
      const calls: HelixCall[] = []
      const brain = yield* testBrain(
        () => ({
          root_item: [itemRow(1, 'Root')],
          hop_1_items: [
            itemRow(2, 'Policy', 'policy'),
            itemRow(2, 'Policy', 'policy'),
          ],
          hop_2_items: [itemRow(3, 'Person', 'person')],
          hop_1_edges: [
            {
              id: 90,
              from: 1,
              to: 1,
              edge: EDGES.mentions,
              workspace_id: tenantId,
              origin: storedOrigin,
              mention_text: 'Alice',
              mention_span_start: 5,
              mention_span_end: 10,
            },
            {
              id: 91,
              from: 1,
              to: 2,
              edge: EDGES.sameAs,
              workspace_id: tenantId,
              origin: storedOrigin,
            },
            {
              id: 91,
              from: 1,
              to: 2,
              edge: EDGES.sameAs,
              workspace_id: tenantId,
              origin: storedOrigin,
            },
          ],
          hop_2_edges: [
            {
              id: 92,
              from: 2,
              to: 3,
              edge: EDGES.hasSection,
              workspace_id: tenantId,
            },
          ],
        }),
        calls,
      )

      const result = yield* brain.neighborhood({
        tenantId,
        itemId: ItemId.make('1'),
        depth: 2,
      })

      expect(result.items.map((item) => item.id)).toEqual([
        ItemId.make('1'),
        ItemId.make('2'),
        ItemId.make('3'),
      ])
      expect(result.edges.map((edge) => edge.edge)).toEqual([
        EDGES.mentions,
        EDGES.sameAs,
        EDGES.hasSection,
      ])
      expect(result.edges[0]?.mention).toMatchObject({
        itemId: ItemId.make('1'),
        text: 'Alice',
        span: { start: 5, end: 10 },
      })
      const request = calls[0]?.request.toJsonString() ?? ''
      expect(request).toContain('"query_name":"brain.neighborhood"')
      expect(request).toContain('"name":"hop_2"')
      expect(request).toContain('"both_e"')
      expect(request).toContain('"literal":50')
      expect(request).toContain('"literal":100')
      expect(request).not.toContain('"repeat"')
    }),
)
