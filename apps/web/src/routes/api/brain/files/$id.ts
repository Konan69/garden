import { Effect, Result as EffectResult } from 'effect'
import { createFileRoute } from '@tanstack/react-router'
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

export const getBrainFileStatus = async ({
  context,
  params,
}: {
  context: AppRequestContext
  params: { id: string }
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
        brain.read(
          ItemId.make(params.id),
          WorkspaceId.make(workspaceContext.workspaceId),
        ),
      ).pipe(Effect.provide(brainLive)),
    ),
  )

  if (EffectResult.isFailure(readResult)) {
    return Response.json(
      { error: 'Brain file status is unavailable' },
      { status: 503 },
    )
  }

  const item = readResult.success
  if (item === null) return notFound('Brain file not found')

  return Response.json(
    {
      item: {
        id: item.id,
        name: item.label,
        status: item.indexed ? 'ready' : 'processing',
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export const Route = createFileRoute('/api/brain/files/$id')({
  server: {
    handlers: {
      GET: getBrainFileStatus,
    },
  },
})
