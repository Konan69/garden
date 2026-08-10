import { Context, DateTime, Effect, Schema } from 'effect'
import {
  BatchCondition,
  IndexSpec,
  NodeRef,
  Predicate,
  PropertyProjection,
  PropertyValue,
  SourcePredicate,
  VectorDistanceMetric,
  g,
  readBatch,
  writeBatch,
} from '@helix-db/helix-db'
import type { PropertyValueInput, Traversal } from '@helix-db/helix-db'
import {
  Actor,
  BrainItem,
  ItemId,
  Kind,
  NewBrainItem,
  Origin,
  WorkspaceId,
} from '../domain/items.ts'
import type { SearchHit } from '../domain/items.ts'
import { EmbedError, ExtractError, HelixError, WriteConflict } from '../errors.ts'
import {
  EDGES,
  LABELS,
  PROPS,
  QUERY,
  SOURCE_KEY_PROP,
  VECTOR_PROP,
} from '../helix/constants.ts'
import { EMBEDDING_DIM, Embeddings } from './Embeddings.ts'
import { HelixClient } from './HelixClient.ts'
import type { HelixClientShape } from './HelixClient.ts'
import { Chunker } from './Chunker.ts'
import { Extractor } from './ExtractorService.ts'
import { RawFileStore } from './RawFileStore.ts'

export type BrainShape = {
  readonly ensureIndexes: () => Effect.Effect<void, HelixError | WriteConflict>
  readonly addItem: (
    input: NewBrainItem,
  ) => Effect.Effect<BrainItem, HelixError | WriteConflict>
  readonly addText: (input: {
    tenantId: WorkspaceId
    label: string
    body: string
    kind?: Kind
    summary?: string
    actor: Actor
  }) => Effect.Effect<BrainItem, HelixError | WriteConflict | EmbedError>
  readonly index: (
    itemId: ItemId,
  ) => Effect.Effect<BrainItem, HelixError | WriteConflict | EmbedError | ExtractError>
  readonly read: (
    id: ItemId,
    tenantId: WorkspaceId,
  ) => Effect.Effect<BrainItem | null, HelixError | WriteConflict>
  readonly search: (input: {
    tenantId: WorkspaceId
    query: string
    k: number
  }) => Effect.Effect<readonly SearchHit[], HelixError | WriteConflict | EmbedError>
  readonly linkSections: (
    fileId: ItemId,
    sectionIds: readonly ItemId[],
    tenantId: WorkspaceId,
  ) => Effect.Effect<void, HelixError | WriteConflict>
  readonly sectionsOf: (
    fileId: ItemId,
    tenantId: WorkspaceId,
  ) => Effect.Effect<readonly BrainItem[], HelixError | WriteConflict>
  readonly readFile: (
    itemId: ItemId,
    range?: { readonly start: number; readonly end: number },
  ) => Effect.Effect<Uint8Array, HelixError | WriteConflict>
}

export class Brain extends Context.Service<Brain, BrainShape>()(
  '@garden/brain/Brain',
) {}

const OriginJsonCodec = Schema.toCodecJson(Origin)

const ItemRow = Schema.Struct({
  $id: Schema.optional(Schema.Number),
  id: Schema.optional(Schema.Number),
  workspace_id: Schema.String,
  kind: Schema.String,
  label: Schema.String,
  summary: Schema.optional(Schema.String),
  r2_key: Schema.optional(Schema.String),
  canonical_type: Schema.optional(Schema.String),
  canonical_value: Schema.optional(Schema.String),
  indexed: Schema.optional(Schema.Boolean),
  origin: Schema.String,
  body: Schema.optional(Schema.String),
})

type Row = Record<string, unknown>

const toRows = (value: unknown): readonly Row[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is Row => typeof row === 'object' && row !== null,
    )
  }
  return typeof value === 'object' && value !== null ? [value as Row] : []
}

const firstRow = (
  result: Record<string, unknown>,
  name: string,
): Row | undefined => toRows(result[name])[0]

const rows = (
  result: Record<string, unknown>,
  name: string,
): readonly Row[] => toRows(result[name])

const nodeId = (itemId: ItemId): number => Number(itemId)

const idOfRow = (row: Row): ItemId =>
  ItemId.make(String(row.$id ?? (row.id as number)))

const decodeOrigin = (raw: unknown): Origin => {
  if (typeof raw !== 'string') throw new Error('item row is missing origin')
  return Schema.decodeSync(
    OriginJsonCodec as unknown as Schema.Decoder<Origin>,
  )(JSON.parse(raw))
}

const originJson = (origin: Origin): string =>
  JSON.stringify(
    Schema.encodeSync(
      OriginJsonCodec as unknown as Schema.Encoder<Schema.Json>,
    )(Schema.decodeUnknownSync(Origin)(origin)),
  )

const rowToItem = (row: Row): BrainItem => {
  const item = Schema.decodeUnknownSync(ItemRow)(row)
  return {
    id: idOfRow(row),
    tenantId: WorkspaceId.make(item.workspace_id),
    kind: Kind.make(item.kind),
    label: item.label,
    summary: item.summary,
    r2Key: item.r2_key,
    canonical:
      item.canonical_type === undefined || item.canonical_value === undefined
        ? undefined
        : { type: item.canonical_type, value: item.canonical_value },
    indexed: item.indexed ?? false,
    origin: decodeOrigin(row.origin),
    body: item.body,
  }
}

const propsOf = (item: NewBrainItem): Record<string, PropertyValueInput> => {
  const props: Record<string, PropertyValueInput> = {
    [PROPS.tenantId]: item.tenantId,
    [PROPS.kind]: item.kind,
    [PROPS.label]: item.label,
    [PROPS.origin]: originJson(item.origin),
  }
  if (item.summary !== undefined) props[PROPS.summary] = item.summary
  if (item.r2Key !== undefined) props[PROPS.r2Key] = item.r2Key
  if (item.canonical !== undefined) {
    props[PROPS.canonicalType] = item.canonical.type
    props[PROPS.canonicalValue] = item.canonical.value
    props[SOURCE_KEY_PROP] = item.canonical.value
  }
  if (item.body !== undefined) props[PROPS.body] = item.body
  return props
}

const propsWithEmbedding = (
  item: NewBrainItem,
  embedding: number[],
): Record<string, PropertyValueInput> => ({
  ...propsOf(item),
  [VECTOR_PROP]: PropertyValue.f32Array(embedding),
})

const itemProps = (): string[] => [...Object.values(PROPS), '$id']

const itemProjection = () => [
  PropertyProjection.renamed('$id', 'id'),
  PropertyProjection.new('workspace_id'),
  PropertyProjection.new('kind'),
  PropertyProjection.new('label'),
  PropertyProjection.new('summary'),
  PropertyProjection.new('r2_key'),
  PropertyProjection.new('canonical_type'),
  PropertyProjection.new('canonical_value'),
  PropertyProjection.new('indexed'),
  PropertyProjection.new('origin'),
  PropertyProjection.new('body'),
]

const hitProjection = () => [
  ...itemProjection(),
  PropertyProjection.renamed('$distance', 'distance'),
  PropertyProjection.renamed('$score', 'score'),
]

const waitForIndex = (helix: HelixClientShape, operationId: string) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 60; attempt++) {
      const request = readBatch()
        .varAs('status', g().getIndexOperation(operationId))
        .returning(['status'])
        .toQueryRequest({ queryName: QUERY.indexStatus })
      const result = yield* helix.run(request)
      const row = firstRow(result, 'status')
      if (row === undefined) {
        return yield* Effect.fail(
          new HelixError({ message: 'index status returned no row' }),
        )
      }
      const status = row.status
      if (status === 'succeeded') return
      if (status === 'aborted' || status === 'blocked') {
        return yield* Effect.fail(
          new HelixError({
            message: `index build ${status}: ${JSON.stringify(row)}`,
          }),
        )
      }
      yield* Effect.sleep(250)
    }
    return yield* Effect.fail(
      new HelixError({ message: `index build timed out: ${operationId}` }),
    )
  })

const SEARCH_FETCH_K = 50

const fuse = (
  lists: readonly (readonly SearchHit[])[],
  k: number,
  limit: number,
): readonly SearchHit[] => {
  const score = new Map<number, { hit: SearchHit; s: number }>()
  for (const list of lists) {
    list.forEach((hit, i) => {
      const key = Number(hit.item.id)
      const current = score.get(key) ?? { hit, s: 0 }
      current.s += 1 / (k + i + 1)
      score.set(key, current)
    })
  }
  return [...score.values()]
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((entry) => entry.hit)
}

const retryWriteConflict = <A, E extends { readonly _tag: string }>(
  effect: Effect.Effect<A, E | HelixError, never>,
): Effect.Effect<A, E | HelixError, never> =>
  Effect.retry(effect, {
    times: 3,
    while: (e): boolean => e._tag === 'WriteConflict',
  })

const setProperties = (
  traversal: Traversal<'nodes', 'write'>,
  props: Record<string, PropertyValueInput>,
): Traversal<'nodes', 'write'> => {
  const entries = Object.entries(props)
  const [firstName, firstValue] = entries[0] as [string, PropertyValueInput]
  let result = traversal.setProperty(firstName, firstValue)
  for (const [name, value] of entries.slice(1)) {
    result = result.setProperty(name, value)
  }
  return result
}

const readItem = (
  helix: HelixClientShape,
  itemId: ItemId,
): Effect.Effect<BrainItem | null, HelixError | WriteConflict> =>
  Effect.gen(function* () {
    const request = readBatch()
      .varAs('item', g().n([nodeId(itemId)]).valueMap(itemProps()))
      .returning(['item'])
      .toQueryRequest({ queryName: QUERY.read })
    const result = yield* helix.run(request)
    const row = firstRow(result, 'item')
    if (row === undefined) return null
    return rowToItem(row)
  })

export const makeBrain = Effect.gen(function* () {
  const helix = yield* HelixClient
  const embeddings = yield* Embeddings
  const chunker = yield* Chunker
  const extractor = yield* Extractor
  const files = yield* RawFileStore
  return Brain.of({
    ensureIndexes: () =>
      Effect.gen(function* () {
        const request = writeBatch()
          .varAs(
            'idx_file_vector',
            g().createIndexIfNotExists(
              IndexSpec.nodeVector(
                LABELS.File,
                VECTOR_PROP,
                EMBEDDING_DIM,
                VectorDistanceMetric.Cosine,
              ),
            ),
          )
          .varAs(
            'idx_file_text',
            g().createIndexIfNotExists(
              IndexSpec.nodeText(LABELS.File, PROPS.body),
            ),
          )
          .varAs(
            'idx_section_vector',
            g().createIndexIfNotExists(
              IndexSpec.nodeVector(
                LABELS.Section,
                VECTOR_PROP,
                EMBEDDING_DIM,
                VectorDistanceMetric.Cosine,
              ),
            ),
          )
          .varAs(
            'idx_section_text',
            g().createIndexIfNotExists(
              IndexSpec.nodeText(LABELS.Section, PROPS.body),
            ),
          )
          .varAs(
            'idx_note_vector',
            g().createIndexIfNotExists(
              IndexSpec.nodeVector(
                LABELS.Note,
                VECTOR_PROP,
                EMBEDDING_DIM,
                VectorDistanceMetric.Cosine,
              ),
            ),
          )
          .varAs(
            'idx_note_text',
            g().createIndexIfNotExists(
              IndexSpec.nodeText(LABELS.Note, PROPS.body),
            ),
          )
          .varAs(
            'idx_file_source',
            g().createIndexIfNotExists(
              IndexSpec.nodeEquality(LABELS.File, SOURCE_KEY_PROP),
            ),
          )
          .varAs(
            'idx_section_source',
            g().createIndexIfNotExists(
              IndexSpec.nodeEquality(LABELS.Section, SOURCE_KEY_PROP),
            ),
          )
          .returning([
            'idx_file_vector',
            'idx_file_text',
            'idx_section_vector',
            'idx_section_text',
            'idx_note_vector',
            'idx_note_text',
            'idx_file_source',
            'idx_section_source',
          ])
          .toQueryRequest({ queryName: QUERY.ensureIndexes })
        const result = yield* helix.run(request)
        const operationIds = toRows(result['idx_file_vector'])
          .concat(toRows(result['idx_file_text']))
          .concat(toRows(result['idx_section_vector']))
          .concat(toRows(result['idx_section_text']))
          .concat(toRows(result['idx_note_vector']))
          .concat(toRows(result['idx_note_text']))
          .concat(toRows(result['idx_file_source']))
          .concat(toRows(result['idx_section_source']))
          .flatMap((row) => {
            const id = row.operation_id
            return typeof id === 'string' ? [id] : []
          })
        yield* Effect.forEach(
          operationIds,
          (id) => waitForIndex(helix, id),
          { concurrency: 'unbounded' },
        )
      }),
    addItem: (input) =>
      Effect.gen(function* () {
        const item = yield* Effect.try({
          try: () => Schema.decodeUnknownSync(NewBrainItem)(input),
          catch: (cause) => new HelixError({ message: 'invalid brain item', cause }),
        })
        const props = propsOf(item)
        const sourceKey = item.canonical?.value
        if (sourceKey === undefined) {
          const request = writeBatch()
            .varAs('created', g().addN(item.kind, props))
            .returning(['created'])
            .toQueryRequest({ queryName: QUERY.index })
          const result = yield* retryWriteConflict(helix.run(request))
          const row = firstRow(result, 'created')
          if (row === undefined) {
            return yield* Effect.fail(
              new HelixError({ message: 'addItem returned no node' }),
            )
          }
          return yield* readItem(helix, idOfRow(row)).pipe(
            Effect.flatMap((loaded) =>
              loaded === null
                ? Effect.fail(
                    new HelixError({ message: 'item not found after add' }),
                  )
                : Effect.succeed(loaded),
            ),
          )
        }
        const request = writeBatch()
          .varAs(
            'existing',
            g()
              .nWithLabelWhere(
                item.kind,
                SourcePredicate.eq(SOURCE_KEY_PROP, sourceKey),
              )
              .where(Predicate.eq(PROPS.tenantId, item.tenantId)),
          )
          .varAsIf(
            'created',
            BatchCondition.varEmpty('existing'),
            g().addN(item.kind, props),
          )
          .varAsIf(
            'updated',
            BatchCondition.varNotEmpty('existing'),
            setProperties(g().n(NodeRef.var('existing')) as unknown as Traversal<'nodes', 'write'>, props),
          )
          .returning(['created', 'updated'])
          .toQueryRequest({ queryName: QUERY.index })
        const result = yield* retryWriteConflict(helix.run(request))
        const created = firstRow(result, 'created')
        const updated = firstRow(result, 'updated')
        const row = created ?? updated
        if (row === undefined) {
          return yield* Effect.fail(
            new HelixError({ message: 'addItem returned no node' }),
          )
        }
        return yield* readItem(helix, idOfRow(row)).pipe(
          Effect.flatMap((loaded) =>
            loaded === null
              ? Effect.fail(
                  new HelixError({ message: 'item not found after add' }),
                )
              : Effect.succeed(loaded),
          ),
        )
      }),
    addText: ({ tenantId, label, body, kind, summary, actor }) =>
      Effect.gen(function* () {
        const item: NewBrainItem = {
          tenantId,
          kind: kind ?? Kind.make(LABELS.Note),
          label,
          ...(summary === undefined ? {} : { summary }),
          body,
          origin: { actor, at: DateTime.makeUnsafe(new Date()) },
        }
        const [vector] = yield* embeddings.embed([body])
        const props = {
          ...propsWithEmbedding(item, vector as number[]),
          [PROPS.indexed]: true,
        }
        const request = writeBatch()
          .varAs('created', g().addN(LABELS.Note, props))
          .returning(['created'])
          .toQueryRequest({ queryName: QUERY.index })
        const result = yield* retryWriteConflict(
          helix.run(request, { awaitDurability: true }),
        )
        const row = firstRow(result, 'created')
        if (row === undefined) {
          return yield* Effect.fail(
            new HelixError({ message: 'addText returned no node' }),
          )
        }
        return yield* readItem(helix, idOfRow(row)).pipe(
          Effect.flatMap((loaded) =>
            loaded === null
              ? Effect.fail(
                  new HelixError({ message: 'item not found after addText' }),
                )
              : Effect.succeed(loaded),
          ),
        )
      }),
    index: (itemId) =>
      Effect.gen(function* () {
        const item = yield* readItem(helix, itemId).pipe(
          Effect.flatMap((loaded) =>
            loaded === null
              ? Effect.fail(
                  new HelixError({ message: `item not found: ${itemId}` }),
                )
              : Effect.succeed(loaded),
          ),
        )
        const key = item.r2Key ?? item.canonical?.value
        if (key === undefined) {
          return yield* Effect.fail(
            new HelixError({ message: `item has no source file: ${itemId}` }),
          )
        }
        const bytes = yield* files.read(key)
        const doc = yield* extractor.extractFromBytes(key, bytes)
        const chunks = yield* chunker.chunk({ ...doc, body: doc.body })
        const sectionBodies = chunks.map((chunk) => chunk.body)
        const vectors = yield* embeddings.embed([doc.body, ...sectionBodies])
        const fileVector = vectors[0] as number[]
        const sectionVectors = vectors.slice(1)

        const sectionEntries = chunks.map((chunk, i) => {
          const section: NewBrainItem = {
            tenantId: item.tenantId,
            kind: Kind.make('section'),
            label: chunk.title,
            body: chunk.body,
            r2Key: item.r2Key,
            canonical:
              item.canonical === undefined
                ? undefined
                : {
                    type: 'section',
                    value: `${item.canonical.value}#${chunk.path ?? chunk.title}`,
                  },
            origin: {
              actor: item.origin.actor,
              fromItem: item.id,
              at: item.origin.at,
            },
          }
          return {
            section,
            props: propsWithEmbedding(
              section,
              sectionVectors[i] as number[],
            ),
          }
        })

        const indexedItem: NewBrainItem = {
          ...item,
          body: doc.body,
          summary: item.summary ?? doc.title,
        }
        const fileProps = propsWithEmbedding(indexedItem, fileVector)
        const fileUpdate = setProperties(
          g()
            .n([nodeId(item.id)])
            .where(Predicate.eq(PROPS.tenantId, item.tenantId)) as unknown as Traversal<
            'nodes',
            'write'
          >,
          fileProps,
        ).setProperty(PROPS.indexed, true)

        let nodeBatch = writeBatch().varAs('file', fileUpdate)
        const sectionNames: string[] = []
        const updatedNames: string[] = []
        for (const [i, entry] of sectionEntries.entries()) {
          const sourceKey = entry.section.canonical?.value
          if (sourceKey === undefined) {
            sectionNames.push(`section${i}`)
            nodeBatch = nodeBatch.varAs(
              `section${i}`,
              g().addN(LABELS.Section, entry.props),
            )
          } else {
            updatedNames.push(`updated${i}`)
            sectionNames.push(`section${i}`)
            nodeBatch = nodeBatch
              .varAs(
                `existing${i}`,
                g()
                  .nWithLabelWhere(
                    LABELS.Section,
                    SourcePredicate.eq(SOURCE_KEY_PROP, sourceKey),
                  )
                  .where(Predicate.eq(PROPS.tenantId, entry.section.tenantId)),
              )
              .varAsIf(
                `section${i}`,
                BatchCondition.varEmpty(`existing${i}`),
                g().addN(LABELS.Section, entry.props),
              )
              .varAsIf(
                `updated${i}`,
                BatchCondition.varNotEmpty(`existing${i}`),
                setProperties(
                  g().n(NodeRef.var(`existing${i}`)) as unknown as Traversal<
                    'nodes',
                    'write'
                  >,
                  entry.props,
                ),
              )
          }
        }
        const nodeResult = yield* retryWriteConflict(
          helix.run(
            nodeBatch
              .returning(['file', ...sectionNames, ...updatedNames])
              .toQueryRequest({ queryName: QUERY.index }),
            { awaitDurability: true },
          ),
        )
        const sectionIds: ItemId[] = sectionEntries.map((_, i) => {
          const created = firstRow(nodeResult, `section${i}`)
          const updated = firstRow(nodeResult, `updated${i}`)
          const row = created ?? updated
          if (row === undefined) {
            throw new Error(`index did not return section ${i}`)
          }
          return idOfRow({ ...row, $id: row.$id ?? row.id })
        })

        let edgeBatch = writeBatch().varAs(
          'file',
          g()
            .n([nodeId(item.id)])
            .where(Predicate.eq(PROPS.tenantId, item.tenantId)),
        )
        sectionIds.forEach((sectionId, i) => {
          edgeBatch = edgeBatch
            .varAs(
              `already${i}`,
              g()
                .n(NodeRef.var('file'))
                .out(EDGES.hasSection)
                .has('$id', nodeId(sectionId)),
            )
            .varAsIf(
              `edge${i}`,
              BatchCondition.varEmpty(`already${i}`),
              g().n(NodeRef.var('file')).addE(EDGES.hasSection, [nodeId(sectionId)], {
                [PROPS.tenantId]: item.tenantId,
              }),
            )
        })
        const edgeRequest = edgeBatch
          .returning(sectionIds.map((_, i) => `edge${i}`))
          .toQueryRequest({ queryName: QUERY.linkSections })
        yield* retryWriteConflict(
          helix.run(edgeRequest, { awaitDurability: true }),
        )
        return yield* readItem(helix, itemId).pipe(
          Effect.flatMap((loaded) =>
            loaded === null
              ? Effect.fail(
                  new HelixError({ message: `item not found: ${itemId}` }),
                )
              : Effect.succeed(loaded),
          ),
        )
      }),
    read: (id, tenantId) =>
      Effect.gen(function* () {
        const request = readBatch()
          .varAs('item', g().n([nodeId(id)]).valueMap(itemProps()))
          .returning(['item'])
          .toQueryRequest({ queryName: QUERY.read })
        const result = yield* helix.run(request)
        const row = firstRow(result, 'item')
        if (row === undefined) return null
        if (row.workspace_id !== tenantId) return null
        return rowToItem(row)
      }),
    search: ({ tenantId, query, k }) =>
      Effect.gen(function* () {
        const [queryVector] = yield* embeddings.embed([query])
        const request = readBatch()
          .varAs(
            'semantic_file',
            g()
              .vectorSearchNodes(
                LABELS.File,
                VECTOR_PROP,
                queryVector as number[],
                SEARCH_FETCH_K,
              )
              .project(hitProjection()),
          )
          .varAs(
            'semantic_section',
            g()
              .vectorSearchNodes(
                LABELS.Section,
                VECTOR_PROP,
                queryVector as number[],
                SEARCH_FETCH_K,
              )
              .project(hitProjection()),
          )
          .varAs(
            'keyword_file',
            g()
              .textSearchNodes(LABELS.File, PROPS.body, query, SEARCH_FETCH_K)
              .project(hitProjection()),
          )
          .varAs(
            'keyword_section',
            g()
              .textSearchNodes(
                LABELS.Section,
                PROPS.body,
                query,
                SEARCH_FETCH_K,
              )
              .project(hitProjection()),
          )
          .varAs(
            'semantic_note',
            g()
              .vectorSearchNodes(
                LABELS.Note,
                VECTOR_PROP,
                queryVector as number[],
                SEARCH_FETCH_K,
              )
              .project(hitProjection()),
          )
          .varAs(
            'keyword_note',
            g()
              .textSearchNodes(LABELS.Note, PROPS.body, query, SEARCH_FETCH_K)
              .project(hitProjection()),
          )
          .returning([
            'semantic_file',
            'semantic_section',
            'keyword_file',
            'keyword_section',
            'semantic_note',
            'keyword_note',
          ])
          .toQueryRequest({ queryName: QUERY.search })
        const result = yield* helix.run(request)
        const rowToHit = (row: Row): SearchHit => ({
          item: rowToItem(row),
          score: (row.score as number) ?? (row.distance as number) ?? 0,
          cite: row.r2_key as string | undefined,
        })
        const filterTenant = (rows: readonly Row[]): readonly Row[] =>
          rows.filter((row) => row.workspace_id === tenantId)
        const lists: readonly (readonly SearchHit[])[] = yield* Effect.forEach(
          [
            'semantic_file',
            'semantic_section',
            'keyword_file',
            'keyword_section',
            'semantic_note',
            'keyword_note',
          ],
          (name) =>
            Effect.succeed(filterTenant(rows(result, name)).map(rowToHit)),
        )
        return fuse(lists, SEARCH_FETCH_K, k)
      }),
    linkSections: (fileId, sectionIds, tenantId) =>
      Effect.gen(function* () {
        let batch = writeBatch().varAs(
          'file',
          g()
            .n([nodeId(fileId)])
            .where(Predicate.eq(PROPS.tenantId, tenantId)),
        )
        sectionIds.forEach((sectionId, i) => {
          batch = batch
            .varAs(
              `already${i}`,
              g()
                .n(NodeRef.var('file'))
                .out(EDGES.hasSection)
                .has('$id', nodeId(sectionId)),
            )
            .varAsIf(
              `edge${i}`,
              BatchCondition.varEmpty(`already${i}`),
              g().n(NodeRef.var('file')).addE(EDGES.hasSection, [nodeId(sectionId)], {
                [PROPS.tenantId]: tenantId,
              }),
            )
        })
        const request = batch
          .returning(sectionIds.map((_, i) => `edge${i}`))
          .toQueryRequest({ queryName: QUERY.linkSections })
        yield* retryWriteConflict(helix.run(request))
      }),
    sectionsOf: (fileId, tenantId) =>
      Effect.gen(function* () {
        const request = readBatch()
          .varAs(
            'sections',
            g()
              .n([nodeId(fileId)])
              .out(EDGES.hasSection)
              .valueMap(itemProps()),
          )
          .returning(['sections'])
          .toQueryRequest({ queryName: QUERY.sectionsOf })
        const result = yield* helix.run(request)
        return yield* Effect.forEach(
          rows(result, 'sections').filter(
            (row) => row.workspace_id === tenantId,
          ),
          (row) => Effect.succeed(rowToItem(row)),
        )
      }),
    readFile: (itemId, range) =>
      Effect.gen(function* () {
        const item = yield* readItem(helix, itemId).pipe(
          Effect.flatMap((loaded) =>
            loaded === null
              ? Effect.fail(
                  new HelixError({ message: `item not found: ${itemId}` }),
                )
              : Effect.succeed(loaded),
          ),
        )
        const key = item.r2Key ?? item.canonical?.value
        if (key === undefined) {
          return yield* Effect.fail(
            new HelixError({ message: `item has no source file: ${itemId}` }),
          )
        }
        return yield* files.read(key, range)
      }),
  })
})
