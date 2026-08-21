import { Effect, Layer, Result as EffectResult } from 'effect'
import { createFileRoute } from '@tanstack/react-router'
import { MAX_FILE_SIZE } from '@garden/core/constants/upload'
import { normalizeDownloadFilename } from '@garden/agent-runtime'
import { makeWebBrainLive } from '@garden/brain/services/web'
import { formatOf } from '@garden/brain/services/extractor'
import {
  requireAppRequestContext,
  type AppRequestContext,
} from '@/lib/server/context'
import { badRequest, requireWorkspaceContext } from '@/lib/server/control-plane'
import type { AppEnv } from '@/lib/server/env'
import { makeBrainAuditClientLayer } from '@/lib/server/brain-audit-runtime'
import {
  BrainFileIngestion,
  BrainFileIngestionError,
  makeBrainFileIngestionLayer,
} from '@/lib/server/brain-file-ingestion'

function brainStorageKey(input: {
  workspaceId: string
  itemId: string
  filename: string
}) {
  return [
    'brain',
    'workspaces',
    input.workspaceId,
    input.itemId,
    normalizeDownloadFilename(input.filename),
  ].join('/')
}

/**
 * Thin TanStack Start boundary for static Brain ingestion. Form parsing and
 * HTTP validation stay here; upload adoption, cleanup, indexing, and agent
 * audit run through the request-provided Effect service layer.
 */
export const postBrainFileUpload = async ({
  context,
  request,
}: {
  context: AppRequestContext
  request: Request
}): Promise<Response> => {
  const appContext = requireAppRequestContext(context)
  const workspaceContext = await requireWorkspaceContext(appContext)
  if (workspaceContext instanceof Response) return workspaceContext

  const env = appContext.env as AppEnv & {
    HELIX_URL?: string
    HELIX_API_KEY?: string
  }
  const helixUrl = env.HELIX_URL
  if (helixUrl === undefined) {
    return badRequest('Brain is not configured (missing HELIX_URL)')
  }

  const formResult = await Effect.runPromise(
    Effect.result(
      Effect.tryPromise({
        try: () => request.formData(),
        catch: (cause) =>
          new BrainFileIngestionError({
            operation: 'parse brain upload form',
            message:
              cause instanceof Error ? cause.message : 'Invalid upload form.',
            cause,
          }),
      }),
    ),
  )
  if (EffectResult.isFailure(formResult)) {
    return badRequest(formResult.failure.message)
  }

  const file = formResult.success.get('file')
  if (!(file instanceof File)) return badRequest('Missing file')
  if (file.size > MAX_FILE_SIZE) return badRequest('File exceeds 100 MB limit')
  if (formatOf(file.name) === null)
    return badRequest(`Unsupported file type: ${file.name}`)

  const itemId = crypto.randomUUID()
  const r2Key = brainStorageKey({
    workspaceId: workspaceContext.workspaceId,
    itemId,
    filename: file.name,
  })
  const brainLive = makeWebBrainLive({
    baseUrl: helixUrl,
    apiKey: env.HELIX_API_KEY,
    ai: env.AI,
    files: env.FILES,
  })
  const ingestionLive = makeBrainFileIngestionLayer(env).pipe(
    Layer.provide(
      Layer.merge(brainLive, makeBrainAuditClientLayer(env.AgentDO)),
    ),
  )
  const stageResult = await Effect.runPromise(
    Effect.result(
      Effect.flatMap(BrainFileIngestion, (ingestion) =>
        ingestion.stage({
          file,
          itemId,
          ownerUserId: workspaceContext.session.user.id,
          r2Key,
          workspaceId: workspaceContext.workspaceId,
        }),
      ).pipe(Effect.provide(ingestionLive)),
    ),
  )
  if (EffectResult.isFailure(stageResult)) {
    return badRequest(stageResult.failure.message)
  }
  const added = stageResult.success

  const waitUntil = appContext.waitUntil ?? (() => {})
  waitUntil(
    Effect.runPromise(
      Effect.flatMap(BrainFileIngestion, (ingestion) =>
        ingestion.indexAndAudit({
          itemId: added.id,
          ownerUserId: workspaceContext.session.user.id,
          workspaceId: workspaceContext.workspaceId,
        }),
      ).pipe(Effect.provide(ingestionLive)),
    ),
  )

  return Response.json(
    {
      item: {
        id: added.id,
        name: added.label,
        status: added.indexed ? 'ready' : 'processing',
      },
    },
    { status: 201 },
  )
}

export const Route = createFileRoute('/api/brain/files')({
  server: {
    handlers: {
      POST: postBrainFileUpload,
    },
  },
})
