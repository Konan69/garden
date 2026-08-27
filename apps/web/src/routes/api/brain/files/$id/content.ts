import { Effect, Result as EffectResult } from 'effect'
import { createFileRoute } from '@tanstack/react-router'
import { buildContentDisposition } from '@garden/agent-runtime'
import { ItemId, WorkspaceId } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import { makeWebBrainLive } from '@garden/brain/services/web'
import {
  requireAppRequestContext,
  type AppRequestContext,
} from '@/lib/server/context'
import {
  badRequest,
  notFound,
  requireWorkspaceContext,
} from '@/lib/server/control-plane'
import type { AppEnv } from '@/lib/server/env'

/**
 * Streams a private Brain file after Brain verifies that the item belongs to
 * the active workspace. The R2 key stays on the server. The response streams
 * the object body so the Worker does not buffer a file of up to 100 MB.
 *
 * Cloudflare R2 reference:
 * https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
 */
export const getBrainFileContent = async ({
  context,
  params,
  request,
}: {
  context: AppRequestContext
  params: { id: string }
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

  const brainLive = makeWebBrainLive({
    baseUrl: helixUrl,
    apiKey: env.HELIX_API_KEY,
    ai: env.AI,
    files: env.FILES,
  })

  const readResult = await Effect.runPromise(
    Effect.result(
      Effect.flatMap(Brain, (brain) =>
        brain.readFileItem(
          ItemId.make(params.id),
          WorkspaceId.make(workspaceContext.workspaceId),
        ),
      ).pipe(Effect.provide(brainLive)),
    ),
  )

  if (EffectResult.isFailure(readResult)) {
    return Response.json(
      { error: 'Brain file content is unavailable' },
      { status: 503 },
    )
  }

  const item = readResult.success
  if (item === null) return notFound('Brain file not found')

  const r2Key = item.r2Key
  if (r2Key === undefined) return notFound('Brain file content not found')

  const objectResult = await Effect.runPromise(
    Effect.result(Effect.tryPromise(() => env.FILES.get(r2Key))),
  )

  if (EffectResult.isFailure(objectResult)) {
    return Response.json(
      { error: 'Brain file content is unavailable' },
      { status: 503 },
    )
  }

  const object = objectResult.success
  if (object === null) return notFound('Brain file content not found')

  const download = new URL(request.url).searchParams.has('download')
  const headers = new Headers()

  object.writeHttpMetadata(headers)
  headers.set(
    'Content-Disposition',
    buildContentDisposition(download ? 'attachment' : 'inline', item.label),
  )
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'private, max-age=3600')
  headers.set('X-Content-Type-Options', 'nosniff')

  return new Response(object.body, { headers })
}

export const Route = createFileRoute('/api/brain/files/$id/content')({
  server: {
    handlers: {
      GET: getBrainFileContent,
    },
  },
})
