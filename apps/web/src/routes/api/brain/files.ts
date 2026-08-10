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
import { requireAppRequestContext, type AppRequestContext } from '@/lib/server/context'
import { badRequest, requireWorkspaceContext } from '@/lib/server/control-plane'
import type { AppEnv } from '@/lib/server/env'

class BrainFileUploadError extends TaggedError('BrainFileUploadError')<{
  message: string
}>() {}

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

  const bytesResult = await Result.tryPromise({
    try: async () => new Uint8Array(await file.arrayBuffer()),
    catch: (cause) =>
      new BrainFileUploadError({
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })
  if (bytesResult.isErr()) return badRequest(bytesResult.error.message)

  const itemId = crypto.randomUUID()
  const r2Key = brainStorageKey({
    workspaceId: workspaceContext.workspaceId,
    itemId,
    filename: file.name,
  })
  const contentType = file.type || 'application/octet-stream'

  const putResult = await Result.tryPromise({
    try: async () =>
      await appContext.env.FILES.put(r2Key, bytesResult.value, {
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

  const brainEffect = Effect.gen(function* () {
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
    yield* brain.ensureIndexes()
    const indexed = yield* brain.index(added.id)
    return indexed
  }).pipe(
    Effect.provide(
      makeWebBrainLive({
        baseUrl: helixUrl,
        apiKey: env.HELIX_API_KEY,
        ai: env.AI,
        files: env.FILES,
      }),
    ),
  )

  const result = await Effect.runPromise(Effect.result(brainEffect))
  if (EffectResult.isFailure(result)) {
    return badRequest(result.failure.message)
  }
  return Response.json({ item: result.success }, { status: 201 })
}

export const Route = createFileRoute('/api/brain/files')({
  server: {
    handlers: {
      POST: postBrainFileUpload,
    },
  },
})
