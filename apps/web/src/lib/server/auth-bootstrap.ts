import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { requireAppRequestContext } from '@/lib/server/context'
import { toWorkspaceFromOrganization } from '@/lib/server/control-plane'
import { schema } from '@/lib/server/db'
import { toCoreUser } from '@/lib/server/session'
import {
  createGardenLogger,
  errorFields,
  requestFields,
} from '@garden/observability/logger'
import type { User, Workspace } from '@garden/core/types'

const bootstrapLogger = createGardenLogger({
  service: 'garden-staging',
  component: 'auth-bootstrap',
})

export interface AuthBootstrap {
  preferredWorkspaceId: string | null
  user: User
  workspaces: Workspace[]
}

/**
 * Loads the authenticated shell bootstrap from request-scoped app context.
 * Garden previously recreated Better Auth from `appEnv`, so
 * `listOrganizations` could not see the signed-in request and threw
 * `Unauthorized` after login. Keeping the same auth instance for session and
 * organization reads makes the workspace landing deterministic. Reference:
 * Better Auth organization plugin and TanStack Start server context.
 */
const rawGetAuthBootstrap = createServerFn({ method: 'GET' }).handler(
  async ({ context }) => {
    const appContext = requireAppRequestContext(context)

    // Wrap the whole bootstrap so infra failures degrade to an unauthenticated
    // result instead of crashing the route. A thrown session or database lookup
    // would otherwise escape the `_authenticated` loader and white-screen the
    // workspace. Infrastructure failure resolves to `null`, which the loader
    // translates into a clean `/login` redirect. Genuine "no session" and
    // "no user" outcomes use the same result. Reference:
    // better-result `Result.tryPromise` boundary wrapping (no try/catch).
    const result = await Result.tryPromise({
      try: async () => {
        const session = await appContext.auth.getSession()
        if (!session) return null

        const db = await appContext.db()
        const [userRow] = await db
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, session.user.id))
        if (!userRow) return null

        const auth = await appContext.auth.getAuth()
        const organizations = await auth.api.listOrganizations({
          headers: appContext.request.headers,
        })
        const requestedWorkspaceId = new URL(
          appContext.request.url,
        ).searchParams.get('workspace_id')
        const activeOrganizationId =
          session.session.activeOrganizationId ?? null
        const preferredWorkspaceId = resolvePreferredWorkspaceId(
          organizations,
          requestedWorkspaceId,
          activeOrganizationId,
        )

        return {
          preferredWorkspaceId,
          user: toCoreUser({
            id: userRow.id,
            email: userRow.email,
            name: userRow.name,
            image: userRow.avatarUrl ?? null,
            createdAt: userRow.createdAt,
            updatedAt: userRow.updatedAt,
          }),
          // Settings is Record<string, unknown> at the type level but the values
          // come from JSONB columns — already JSON-serializable. Cast lets
          // TanStack's server-fn validator accept the response.
          workspaces: organizations.map((organization) =>
            toWorkspaceFromOrganization(organization, 'owner'),
          ) as unknown as never,
        }
      },
      catch: (cause) => cause,
    })

    if (result.isErr()) {
      bootstrapLogger.warn('auth.bootstrap.degraded', {
        ...requestFields(appContext.request),
        ...errorFields(result.error),
      })
      return null
    }

    return result.value
  },
)

function resolvePreferredWorkspaceId(
  organizations: Array<{ id: string }>,
  requestedWorkspaceId: string | null,
  activeOrganizationId: string | null,
) {
  if (
    requestedWorkspaceId &&
    organizations.some(
      (organization) => organization.id === requestedWorkspaceId,
    )
  ) {
    return requestedWorkspaceId
  }

  if (
    activeOrganizationId &&
    organizations.some(
      (organization) => organization.id === activeOrganizationId,
    )
  ) {
    return activeOrganizationId
  }

  return null
}

export const getAuthBootstrap: () => Promise<AuthBootstrap | null> = () =>
  rawGetAuthBootstrap() as Promise<AuthBootstrap | null>
