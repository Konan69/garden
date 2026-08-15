import { Effect, Result as EffectResult, DateTime } from 'effect'
import { Result, TaggedError } from 'better-result'
import { createFileRoute } from '@tanstack/react-router'
import { MAX_FILE_SIZE } from '@garden/core/constants/upload'
import {
  buildContentDisposition,
  normalizeDownloadFilename,
} from '@garden/agent-runtime'
import { Kind, WorkspaceId } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import { makeWebBrainLive } from '@garden/brain/services/web'
import { formatOf } from '@garden/brain/services/extractor'
import { createGardenLogger, errorFields } from '@garden/observability/logger'
import {
  requireAppRequestContext,
  type AppRequestContext,
} from '@/lib/server/context'
import { badRequest, requireWorkspaceContext } from '@/lib/server/control-plane'
import type { AppEnv } from '@/lib/server/env'

class BrainFileUploadError extends TaggedError('BrainFileUploadError')<{
  message: string
}>() {}

const brainUploadLogger = createGardenLogger({
  service: 'garden-staging',
  component: 'brain-upload',
})

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
 * Best-effort cleanup for an upload the Brain did not adopt. Previously failure
 * paths leaked the staged R2 object and duplicate handling deleted the active
 * object's key; callers now always pass the newly written key for removal.
 */
async function discardStagedUpload(
  files: Pick<R2Bucket, 'delete'>,
  r2Key: string,
  reason: 'duplicate' | 'upload_failed',
): Promise<void> {
  const deleteResult = await Result.tryPromise({
    try: async () => await files.delete(r2Key),
    catch: (cause) =>
      new BrainFileUploadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
  deleteResult.tapError((error) => {
    brainUploadLogger.error('brain staged upload cleanup failed', {
      r2Key,
      reason,
      ...errorFields(error),
    })
  })
}

/**
 * Handles the Brain file server route. The handler writes R2 first, then either
 * adopts that key through Brain or removes it on configuration/write failure;
 * canonical duplicates retain the existing active object and discard the new key.
 * TanStack Start server-route and better-result boundary guidance were consulted.
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

  const formResult = await Result.tryPromise({
    try: async () => await request.formData(),
    catch: (cause) =>
      new BrainFileUploadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
  if (formResult.isErr()) return badRequest(formResult.error.message)

  const file = formResult.value.get('file')
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
  const contentType = file.type || 'application/octet-stream'

  const putResult = await Result.tryPromise({
    try: async () =>
      await appContext.env.FILES.put(r2Key, file.stream(), {
        httpMetadata: {
          contentType,
          contentDisposition: buildContentDisposition('inline', file.name),
        },
      }),
    catch: (cause) =>
      new BrainFileUploadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
  if (putResult.isErr()) return badRequest(putResult.error.message)

  const brainLive = makeWebBrainLive({
    baseUrl: helixUrl,
    apiKey: env.HELIX_API_KEY,
    ai: env.AI,
    files: env.FILES,
  })

  const addItemEffect = Effect.gen(function* () {
    const brain = yield* Brain
    const added = yield* brain.addItem({
      tenantId: WorkspaceId.make(workspaceContext.workspaceId),
      kind: Kind.make('file'),
      label: normalizeDownloadFilename(file.name),
      r2Key,
      canonical: {
        type: 'file',
        value: `brain:${workspaceContext.workspaceId}:${normalizeDownloadFilename(file.name)}`,
      },
      origin: {
        actor: {
          _tag: 'Human',
          userId: workspaceContext.session.user.id,
        },
        at: DateTime.makeUnsafe(new Date()),
      },
    })
    return added
  }).pipe(Effect.provide(brainLive))

  const addItemResult = await Effect.runPromise(Effect.result(addItemEffect))
  if (EffectResult.isFailure(addItemResult)) {
    await discardStagedUpload(env.FILES, r2Key, 'upload_failed')
    return badRequest(addItemResult.failure.message)
  }
  const added = addItemResult.success
  if (added.r2Key !== undefined && added.r2Key !== r2Key) {
    await discardStagedUpload(env.FILES, r2Key, 'duplicate')
  }

  const waitUntil = appContext.waitUntil ?? (() => {})
  waitUntil(
    Effect.runPromise(
      Effect.gen(function* () {
        const brain = yield* Brain
        yield* brain.ensureIndexes()
        return yield* brain.index(
          added.id,
          WorkspaceId.make(workspaceContext.workspaceId),
        )
      }).pipe(
        Effect.provide(brainLive),
        Effect.catch((failure) => {
          brainUploadLogger.error('brain file deferred indexing failed', {
            itemId: added.id,
            ...errorFields(failure),
          })
          return Effect.succeed(null)
        }),
      ),
    ),
  )

  return Response.json({ item: added }, { status: 201 })
}

export const Route = createFileRoute('/api/brain/files')({
  server: {
    handlers: {
      POST: postBrainFileUpload,
    },
  },
})
