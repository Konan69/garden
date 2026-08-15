import { Result } from 'better-result'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { ManagedRuntime, Effect } from 'effect'
import { ItemId, Kind, WorkspaceId } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import type { BrainShape } from '@garden/brain/services/brain'
import { makeWorkerBrainLive } from '@garden/brain/services/worker'
import type { WorkersAiBinding } from '@garden/brain/services/embeddings'
import type { R2BucketLike } from '@garden/brain/services/raw-file-store'

export type BrainToolContext = {
  readonly workspaceId: string
  readonly agentId: string
  readonly runId: string
}

export type BrainToolOperations = Pick<
  BrainShape,
  | 'ensureIndexes'
  | 'search'
  | 'addText'
  | 'recordMention'
  | 'linkItems'
  | 'neighborhood'
>

const MAX_SEARCH_K = 8
const MAX_HIT_BODY_CHARS = 4_000

const brainSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe('What to find in the workspace brain.'),
    k: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_K)
      .optional()
      .describe(`How many results to return (default 5, max ${MAX_SEARCH_K}).`),
  })
  .strict()

const addToBrainInputSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .describe('Short name for this brain item, e.g. a title.'),
    content: z
      .string()
      .trim()
      .min(1)
      .describe('The knowledge to persist, in the agent’s own words.'),
    kind: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Optional free-text kind you invent, e.g. "decision", "person", or "policy"; it is not an enum. Everything is searchable regardless of kind.',
      ),
    summary: z
      .string()
      .trim()
      .optional()
      .describe('Optional one-line summary for fast triage.'),
  })
  .strict()

const brainRecordMentionInputSchema = z
  .object({
    itemId: z
      .string()
      .trim()
      .min(1)
      .describe('Source brain item where this exact mention was observed.'),
    text: z
      .string()
      .trim()
      .min(1)
      .describe('Exact mention string copied from the source.'),
    span: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      })
      .strict()
      .refine((span) => span.end >= span.start, {
        message: 'Mention span end must be greater than or equal to start.',
      })
      .optional()
      .describe('Optional zero-based source character range.'),
  })
  .strict()

const brainLinkInputSchema = z
  .object({
    from: z.string().trim().min(1).describe('Source brain item id.'),
    to: z.string().trim().min(1).describe('Target brain item id.'),
    edge: z
      .string()
      .trim()
      .min(1)
      .describe(
        'Free-text relationship label, e.g. "DECIDED_BY", "MENTIONS", or "SAME_AS".',
      ),
  })
  .strict()

const brainNeighborhoodInputSchema = z
  .object({
    itemId: z.string().trim().min(1).describe('Brain item to explore.'),
    depth: z
      .number()
      .int()
      .min(1)
      .max(2)
      .optional()
      .describe('Fixed traversal depth (default 1, max 2).'),
  })
  .strict()

const toHit = (raw: {
  item: {
    id: string
    label: string
    kind: string
    summary?: string
    body?: string
  }
  score: number
  cite?: string
}) => ({
  id: raw.item.id,
  label: raw.item.label,
  kind: raw.item.kind,
  ...(raw.item.summary === undefined ? {} : { summary: raw.item.summary }),
  ...(raw.item.body === undefined
    ? {}
    : { body: raw.item.body.slice(0, MAX_HIT_BODY_CHARS) }),
  score: raw.score,
  ...(raw.cite === undefined ? {} : { cite: raw.cite }),
})

const toNeighborhoodItem = (item: {
  id: string
  label: string
  kind: string
  summary?: string
  body?: string
}) => ({
  id: item.id,
  label: item.label,
  kind: item.kind,
  ...(item.summary === undefined ? {} : { summary: item.summary }),
  ...(item.body === undefined
    ? {}
    : { body: item.body.slice(0, MAX_HIT_BODY_CHARS) }),
})

const toNeighborhoodEdge = (edge: {
  id: string
  from: string
  to: string
  edge: string
  mention?: {
    text: string
    span?: { readonly start: number; readonly end: number }
  }
}) => ({
  id: edge.id,
  from: edge.from,
  to: edge.to,
  edge: edge.edge,
  ...(edge.mention === undefined
    ? {}
    : {
        mention: {
          text: edge.mention.text,
          ...(edge.mention.span === undefined
            ? {}
            : { span: edge.mention.span }),
        },
      }),
})

/**
 * Exposes the Brain service as small structured agent operations. Previously
 * agents could only search or add isolated notes; they can now persist exact
 * mention observations, link existing items, and inspect bounded neighborhoods
 * without seeing or constructing Helix DSL queries.
 */
export function createBrainTools(deps: {
  env: { HELIX_URL?: string; HELIX_API_KEY?: string }
  ai: WorkersAiBinding
  files: R2BucketLike
  getContext: () => BrainToolContext | null | Promise<BrainToolContext | null>
  brain?: BrainToolOperations
}): ToolSet {
  const runtime =
    deps.env.HELIX_URL === undefined
      ? null
      : ManagedRuntime.make(
          makeWorkerBrainLive({
            baseUrl: deps.env.HELIX_URL,
            apiKey: deps.env.HELIX_API_KEY,
            ai: deps.ai,
            files: deps.files,
          }),
        )

  const resolveContext = async (): Promise<
    { ok: true; ctx: BrainToolContext } | { ok: false; error: string }
  > => {
    const ctx = await deps.getContext()
    if (ctx === null) {
      return {
        ok: false,
        error:
          'No active run context; the brain tools need a workspace and agent.',
      }
    }
    return { ok: true, ctx }
  }

  const unconfigured = {
    ok: false as const,
    error: 'The workspace brain is not configured (missing HELIX_URL).',
  }

  const configured = deps.brain !== undefined || runtime !== null

  /** Runs one Effect operation against an injected test seam or live runtime. */
  const runBrain = <A, E>(
    operation: (brain: BrainToolOperations) => Effect.Effect<A, E>,
  ): Promise<A> => {
    if (deps.brain !== undefined) {
      return Effect.runPromise(operation(deps.brain))
    }
    if (runtime !== null) {
      return runtime.runPromise(Effect.flatMap(Brain, operation))
    }
    return Promise.reject(new Error(unconfigured.error))
  }

  let ensurePromise: Promise<void> | null = null
  const ensureIndexes = (): Promise<void> => {
    if (!configured) return Promise.resolve()
    if (ensurePromise === null) {
      ensurePromise = runBrain((brain) => brain.ensureIndexes()).then(
        () => undefined,
        (cause: unknown) => {
          ensurePromise = null
          return Promise.reject(cause)
        },
      )
    }
    return ensurePromise
  }

  const captureBrainOperation = <A>(operation: () => Promise<A>) =>
    Result.tryPromise({
      try: operation,
      catch: (cause) =>
        cause instanceof Error
          ? cause
          : new Error(typeof cause === 'string' ? cause : String(cause)),
    })

  const actorFrom = (ctx: BrainToolContext) => ({
    _tag: 'Agent' as const,
    agentId: ctx.agentId,
    runId: ctx.runId,
  })

  const runSearch = async (ctx: BrainToolContext, query: string, k: number) => {
    if (!configured) return unconfigured
    const result = await captureBrainOperation(async () => {
      await ensureIndexes()
      return await runBrain((brain) =>
        brain.search({
          tenantId: WorkspaceId.make(ctx.workspaceId),
          query,
          k,
        }),
      )
    })
    return result.match<Record<string, unknown>>({
      ok: (hits) => ({
        ok: true as const,
        hits: hits.map((hit) => toHit(hit)),
      }),
      err: (error) => ({
        ok: false as const,
        error: 'brain_search_failed',
        message: error.message,
      }),
    })
  }

  const runAddText = async (
    ctx: BrainToolContext,
    input: z.infer<typeof addToBrainInputSchema>,
  ) => {
    if (!configured) return unconfigured
    const result = await captureBrainOperation(async () => {
      await ensureIndexes()
      return await runBrain((brain) =>
        brain.addText({
          tenantId: WorkspaceId.make(ctx.workspaceId),
          label: input.label,
          body: input.content,
          ...(input.kind === undefined ? {} : { kind: Kind.make(input.kind) }),
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          actor: actorFrom(ctx),
        }),
      )
    })
    return result.match<Record<string, unknown>>({
      ok: (item) => ({
        ok: true as const,
        id: item.id,
        label: item.label,
        kind: item.kind,
        indexed: item.indexed,
      }),
      err: (error) => ({
        ok: false as const,
        error: 'add_to_brain_failed',
        message: error.message,
      }),
    })
  }

  const runRecordMention = async (
    ctx: BrainToolContext,
    input: z.infer<typeof brainRecordMentionInputSchema>,
  ) => {
    if (!configured) return unconfigured
    const result = await captureBrainOperation(() =>
      runBrain((brain) =>
        brain.recordMention({
          tenantId: WorkspaceId.make(ctx.workspaceId),
          itemId: ItemId.make(input.itemId),
          text: input.text,
          ...(input.span === undefined ? {} : { span: input.span }),
          actor: actorFrom(ctx),
        }),
      ),
    )
    return result.match<Record<string, unknown>>({
      ok: (observation) => ({
        ok: true as const,
        itemId: observation.itemId,
        text: observation.text,
        ...(observation.span === undefined ? {} : { span: observation.span }),
      }),
      err: (error) => ({
        ok: false as const,
        error: 'brain_record_mention_failed',
        message: error.message,
      }),
    })
  }

  const runLink = async (
    ctx: BrainToolContext,
    input: z.infer<typeof brainLinkInputSchema>,
  ) => {
    if (!configured) return unconfigured
    const result = await captureBrainOperation(() =>
      runBrain((brain) =>
        brain.linkItems({
          tenantId: WorkspaceId.make(ctx.workspaceId),
          from: ItemId.make(input.from),
          to: ItemId.make(input.to),
          edge: input.edge,
          actor: actorFrom(ctx),
        }),
      ),
    )
    return result.match<Record<string, unknown>>({
      ok: (link) => ({ ok: true as const, ...link }),
      err: (error) => ({
        ok: false as const,
        error: 'brain_link_failed',
        message: error.message,
      }),
    })
  }

  const runNeighborhood = async (
    ctx: BrainToolContext,
    input: z.infer<typeof brainNeighborhoodInputSchema>,
  ) => {
    if (!configured) return unconfigured
    const result = await captureBrainOperation(() =>
      runBrain((brain) =>
        brain.neighborhood({
          tenantId: WorkspaceId.make(ctx.workspaceId),
          itemId: ItemId.make(input.itemId),
          ...(input.depth === undefined ? {} : { depth: input.depth }),
        }),
      ),
    )
    return result.match<Record<string, unknown>>({
      ok: (neighborhood) => ({
        ok: true as const,
        items: neighborhood.items.map(toNeighborhoodItem),
        edges: neighborhood.edges.map(toNeighborhoodEdge),
      }),
      err: (error) => ({
        ok: false as const,
        error: 'brain_neighborhood_failed',
        message: error.message,
      }),
    })
  }

  return {
    brain_search: tool({
      description:
        'Search the workspace’s Org Brain: indexed files, notes, decisions, and agent-written knowledge. Returns scored, cited hits scoped to this workspace. Use it to recall what the workspace already knows before re-deriving or re-searching the web.',
      inputSchema: brainSearchInputSchema,
      execute: async (input) => {
        const resolved = await resolveContext()
        if (!resolved.ok) return { ok: false, error: resolved.error }
        return await runSearch(resolved.ctx, input.query, input.k ?? 5)
      },
    }),

    add_to_brain: tool({
      description:
        'Persist durable knowledge in the workspace’s Org Brain. Kind is free text you choose—not an enum—such as "decision", "person", or "policy"; label clearly and write content in your own words.',
      inputSchema: addToBrainInputSchema,
      execute: async (input) => {
        const resolved = await resolveContext()
        if (!resolved.ok) return { ok: false, error: resolved.error }
        return await runAddText(resolved.ctx, input)
      },
    }),

    brain_record_mention: tool({
      description:
        'Garden defines no ontology—kinds are yours to invent; record exact mentions while you read so later resolution can rerun without rereading the source.',
      inputSchema: brainRecordMentionInputSchema,
      execute: async (input) => {
        const resolved = await resolveContext()
        if (!resolved.ok) return { ok: false, error: resolved.error }
        return await runRecordMention(resolved.ctx, input)
      },
    }),

    brain_link: tool({
      description:
        'Invent relationship labels as the corpus demands; use SAME_AS only as a soft probable-duplicate link and never merge items.',
      inputSchema: brainLinkInputSchema,
      execute: async (input) => {
        const resolved = await resolveContext()
        if (!resolved.ok) return { ok: false, error: resolved.error }
        return await runLink(resolved.ctx, input)
      },
    }),

    brain_neighborhood: tool({
      description:
        'Explore the agent-built graph in a bounded one- or two-hop view; item kinds and relationship labels are free text invented from the corpus.',
      inputSchema: brainNeighborhoodInputSchema,
      execute: async (input) => {
        const resolved = await resolveContext()
        if (!resolved.ok) return { ok: false, error: resolved.error }
        return await runNeighborhood(resolved.ctx, input)
      },
    }),
  }
}
