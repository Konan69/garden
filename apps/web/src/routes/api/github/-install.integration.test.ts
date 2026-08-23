import { Result } from 'better-result'
import type { AppRequestContext } from '@/lib/server/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './install'

const mocks = vi.hoisted(() => ({
  getGitHubAppInstallation: vi.fn(),
  requireSession: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}))

vi.mock('@garden/connectors/github-app', () => ({
  getGitHubAppInstallation: mocks.getGitHubAppInstallation,
}))

vi.mock('@/lib/server/control-plane', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/server/control-plane')>()
  return {
    ...actual,
    requireSession: mocks.requireSession,
    resolveWorkspaceId: mocks.resolveWorkspaceId,
  }
})

vi.mock('@/lib/server/env', () => ({
  appEnv: {
    BETTER_AUTH_SECRET: 'test-secret',
    GITHUB_APP_ID: '3547700',
    GITHUB_APP_PRIVATE_KEY: 'test-private-key',
    GITHUB_APP_SLUG: 'garden-ai-dev',
  },
}))

vi.mock('@/lib/server/github-app', () => ({
  buildGitHubAppInstallUrl: ({
    appSlug,
    state,
  }: {
    appSlug: string
    state: string
  }) => `https://github.com/apps/${appSlug}/installations/new?state=${state}`,
  createGitHubSetupState: vi.fn(async () => 'signed-state'),
  normalizeGitHubAppEnv: (env: unknown) => env,
  resolveGitHubAppSlug: () => 'garden-ai-dev',
}))

function getHandler() {
  const handlers = Route.options.server?.handlers
  if (!handlers || typeof handlers === 'function' || !handlers.GET) {
    throw new Error('Expected GitHub install GET handler')
  }
  return handlers.GET
}

describe('GitHub install recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSession.mockResolvedValue({ user: { id: 'user-id' } })
    mocks.resolveWorkspaceId.mockResolvedValue('workspace-id')
  })

  it('marks a stale connected row degraded and starts a signed repair flow', async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([
        { id: 'installation-row-id', installationId: 'old-installation-id' },
      ])
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: updateWhere })),
      })),
    }
    mocks.getGitHubAppInstallation.mockResolvedValue(
      Result.err(new Error('Not Found')),
    )

    const request = new Request(
      'https://garden.test/api/github/install?connector_flow=flow-id',
    )
    const response = await getHandler()({
      context: { db: async () => db } as unknown as AppRequestContext,
      request,
      params: {},
      pathname: '/api/github/install',
      next: () => ({ isNext: true, context: undefined }),
    })

    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(
      'https://github.com/apps/garden-ai-dev/installations/new?state=signed-state',
    )
    expect(db.update).toHaveBeenCalledOnce()
    expect(updateWhere).toHaveBeenCalledOnce()
  })
})
