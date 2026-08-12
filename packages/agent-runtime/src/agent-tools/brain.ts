import { Result } from 'better-result'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { ManagedRuntime, Effect } from 'effect'
import { Kind, WorkspaceId } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import { makeWorkerBrainLive } from '@garden/brain/services/worker'
import type { WorkersAiBinding } from '@garden/brain/services/embeddings'
import type { R2BucketLike } from '@garden/brain/services/raw-file-store'

export type BrainToolContext = {
  readonly workspaceId: string
  readonly agentId: string
  readonly runId: string
}

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
        'Optional free-text tag for filtering and display, e.g. "decision", "fact", "lesson". Everything written is searchable regardless of kind.',
      ),
    summary: z
      .string()
      .trim()
      .optional()
      .describe('Optional one-line summary for fast triage.'),
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

export function createBrainTools(deps: {
  env: { HELIX_URL?: string; HELIX_API_KEY?: string }
  ai: WorkersAiBinding
  files: R2BucketLike
  getContext: () => BrainToolContext | null | Promise<BrainToolContext | null>
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
    | { ok: true; ctx: BrainToolContext }
    | { ok: false; error: string }
  > => {
    const ctx = await deps.getContext()
    if (ctx === null) {
      return {
        ok: false,
        error: 'No active run context; the brain tools need a workspace and agent.',
      }
    }
    return { ok: true, ctx }
  }

  const unconfigured = {
    ok: false as const,
    error: 'The workspace brain is not configured (missing HELIX_URL).',
  }

  let ensurePromise: Promise<void> | null = null
  const ensureIndexes = (): Promise<void> => {
    if (runtime === null) return Promise.resolve()
    if (ensurePromise === null) {
      ensurePromise = runtime
        .runPromise(
          Effect.gen(function* () {
            const brain = yield* Brain
            yield* brain.ensureIndexes()
          }),
        )
        .catch((cause: unknown) => {
          ensurePromise = null
          throw cause
        })
    }
    return ensurePromise
  }

  const runSearch = async (ctx: BrainToolContext, query: string, k: number) => {
    if (runtime === null) return unconfigured
    const result = await Result.tryPromise({
      try: async () => {
        await ensureIndexes()
        return await runtime.runPromise(
          Effect.gen(function* () {
            const brain = yield* Brain
            return yield* brain.search({
              tenantId: WorkspaceId.make(ctx.workspaceId),
              query,
              k,
            })
          }),
        )
      },
      catch: (cause) =>
        cause instanceof Error
          ? cause
          : new Error(typeof cause === 'string' ? cause : String(cause)),
    })
    if (result.isErr()) {
      return {
        ok: false as const,
        error: 'brain_search_failed',
        message: result.error.message,
      }
    }
    return {
      ok: true as const,
      hits: result.value.map((hit) => toHit(hit)),
    }
  }

  const runAddText = async (
    ctx: BrainToolContext,
    input: z.infer<typeof addToBrainInputSchema>,
  ) => {
    if (runtime === null) return unconfigured
    const result = await Result.tryPromise({
      try: async () => {
        await ensureIndexes()
        return await runtime.runPromise(
          Effect.gen(function* () {
            const brain = yield* Brain
            return yield* brain.addText({
              tenantId: WorkspaceId.make(ctx.workspaceId),
              label: input.label,
              body: input.content,
              ...(input.kind === undefined ? {} : { kind: Kind.make(input.kind) }),
              ...(input.summary === undefined ? {} : { summary: input.summary }),
              actor: {
                _tag: 'Agent' as const,
                agentId: ctx.agentId,
                runId: ctx.runId,
              },
            })
          }),
        )
      },
      catch: (cause) =>
        cause instanceof Error
          ? cause
          : new Error(typeof cause === 'string' ? cause : String(cause)),
    })
    if (result.isErr()) {
      return {
        ok: false as const,
        error: 'add_to_brain_failed',
        message: result.error.message,
      }
    }
    return {
      ok: true as const,
      id: result.value.id,
      label: result.value.label,
      indexed: result.value.indexed,
    }
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
        'Persist a durable fact, decision, note, or lesson into the workspace’s Org Brain so future conversations and runs can recall it. Label it clearly and write the content in the agent’s own words; the item is embedded and indexed immediately. Prefer this over keeping knowledge only in the transcript.',
      inputSchema: addToBrainInputSchema,
      execute: async (input) => {
        const resolved = await resolveContext()
        if (!resolved.ok) return { ok: false, error: resolved.error }
        return await runAddText(resolved.ctx, input)
      },
    }),
  }
}
