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
import { requireAppRequestContext, type AppRequestContext } from '@/lib/server/context'
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
  if (file.size > MAX_FILE_SIZE)
    return badRequest('File exceeds 100 MB limit')
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
          contentDisposition: buildContentDisposition(
            'inline',
            file.name,
          ),
        },
      }),
    catch: (cause) =>
      new BrainFileUploadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
  if (putResult.isErr()) return badRequest(putResult.error.message)

  const env = appContext.env as AppEnv & {
    HELIX_URL?: string
    HELIX_API_KEY?: string
  }
  const helixUrl = env.HELIX_URL
  if (helixUrl === undefined) {
    return badRequest('Brain is not configured (missing HELIX_URL)')
  }

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
    if (added.r2Key !== undefined && added.r2Key !== r2Key) {
      yield* Effect.tryPromise(async () => {
        await env.FILES.delete(added.r2Key)
      }).pipe(Effect.ignore)
    }
    return added
  }).pipe(Effect.provide(brainLive))

  const addItemResult = await Effect.runPromise(Effect.result(addItemEffect))
  if (EffectResult.isFailure(addItemResult)) {
    return badRequest(addItemResult.failure.message)
  }
  const added = addItemResult.success

  const waitUntil = appContext.waitUntil ?? (() => {})
  waitUntil(
    Effect.runPromise(
      Effect.gen(function* () {
        const brain = yield* Brain
        yield* brain.ensureIndexes()
        return yield* brain.index(added.id)
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
