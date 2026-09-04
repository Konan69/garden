// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { ItemId, WorkspaceId, type BrainItem } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import { makeWebBrainLive } from '@garden/brain/services/web'
import type { AppRequestContext } from '@/lib/server/context'
import { postBrainFileUpload } from './files'

const FIXTURES = resolve(process.cwd(), '../../packages/brain/fixtures/docs')

const mockRequireAppRequestContext = vi.hoisted(() => vi.fn())
const mockRequireWorkspaceContext = vi.hoisted(() => vi.fn())
const mockBrainItems = vi.hoisted(() => new Map<string, BrainItem>())
const mockGetAgentByName = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    startBrainAudit: vi.fn().mockResolvedValue({
      ok: true,
      status: 'completed',
    }),
  }),
)

vi.mock('agents', () => ({ getAgentByName: mockGetAgentByName }))

vi.mock('@garden/app-state/platform/rpc', () => ({
  disposeRpcResult: (value: unknown) => value,
}))

vi.mock('@garden/agent-runtime', () => ({
  buildContentDisposition: () => 'inline',
  normalizeDownloadFilename: (name: string) => name,
}))

vi.mock('@garden/brain/services/web', async () => {
  const { Brain: BrainService } = await vi.importActual<
    typeof import('@garden/brain/services/brain')
  >('@garden/brain/services/brain')

  return {
    makeWebBrainLive: () =>
      Layer.succeed(
        BrainService,
        BrainService.of({
          ensureIndexes: () => Effect.void,
          addItem: (input) => {
            const canonicalValue = input.canonical?.value
            const existing = [...mockBrainItems.values()].find(
              (item) =>
                item.tenantId === input.tenantId &&
                item.canonical?.value === canonicalValue,
            )
            if (existing !== undefined) return Effect.succeed(existing)
            const item: BrainItem = {
              id: ItemId.make(`item-${mockBrainItems.size + 1}`),
              tenantId: input.tenantId,
              kind: input.kind,
              label: input.label,
              ...(input.summary === undefined
                ? {}
                : { summary: input.summary }),
              ...(input.r2Key === undefined ? {} : { r2Key: input.r2Key }),
              ...(input.canonical === undefined
                ? {}
                : { canonical: input.canonical }),
              indexed: false,
              origin: input.origin,
              ...(input.body === undefined ? {} : { body: input.body }),
            }
            mockBrainItems.set(item.id, item)
            return Effect.succeed(item)
          },
          index: (itemId, tenantId) => {
            const item = mockBrainItems.get(itemId)
            if (item === undefined || item.tenantId !== tenantId) {
              return Effect.die(`missing test brain item ${itemId}`)
            }
            const indexed: BrainItem = {
              ...item,
              indexed: true,
              body: `${item.label} indexed content`,
            }
            mockBrainItems.set(item.id, indexed)
            return Effect.succeed(indexed)
          },
          search: ({ tenantId, query, k }) =>
            Effect.succeed(
              [...mockBrainItems.values()]
                .filter(
                  (item) =>
                    item.tenantId === tenantId &&
                    `${item.label} ${item.body ?? ''}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .slice(0, k)
                .map((item) => ({ item, score: 1 })),
            ),
          addText: () => Effect.die('unused addText'),
          updateItemMetadata: () => Effect.die('unused updateItemMetadata'),
          read: () => Effect.die('unused read'),
          linkSections: () => Effect.die('unused linkSections'),
          sectionsOf: () => Effect.die('unused sectionsOf'),
          observeMention: () => Effect.die('unused observeMention'),
          linkItems: () => Effect.die('unused linkItems'),
          neighborhood: () => Effect.die('unused neighborhood'),
          readFile: () => Effect.die('unused readFile'),
        }),
      ),
  }
})

vi.mock('@/lib/server/context', () => ({
  requireAppRequestContext: mockRequireAppRequestContext,
}))

vi.mock('@/lib/server/control-plane', () => ({
  badRequest: (message: string) =>
    Response.json({ error: message }, { status: 400 }),
  requireWorkspaceContext: mockRequireWorkspaceContext,
}))

vi.mock('@/lib/server/chat-agents', () => ({
  ensureAgentRow: vi.fn().mockResolvedValue({
    id: 'agent-1',
    hostName: 'agent-host-1',
  }),
}))

vi.mock('@/lib/server/db', () => ({
  getDb: vi.fn().mockResolvedValue({ id: 'db' }),
}))

const stubAi = {
  run: async (model: string, input: { text: string | string[] }) => {
    if (model !== '@cf/baai/bge-small-en-v1.5')
      throw new Error(`unexpected model ${model}`)
    const texts = Array.isArray(input.text) ? input.text : [input.text ?? '']
    return {
      data: texts.map((t) =>
        Array.from({ length: 384 }, (_, i) => (i + (t?.length ?? 0)) / 384),
      ),
    }
  },
}

function makeFiles() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    bucket: {
      put: async (
        key: string,
        value: Uint8Array | ReadableStream<Uint8Array>,
      ) => {
        const bytes =
          value instanceof ReadableStream
            ? new Uint8Array(await new Response(value).arrayBuffer())
            : value
        objects.set(key, bytes)
      },
      get: async (key: string) => {
        const value = objects.get(key)
        return value === undefined
          ? null
          : { arrayBuffer: async () => value.buffer }
      },
      delete: async (key: string) => {
        objects.delete(key)
      },
    },
  }
}

function fakeContext(env: Record<string, unknown>): { context: unknown } {
  const deferred: Promise<unknown>[] = []
  return {
    context: {
      env,
      auth: {},
      waitUntil: (promise: Promise<unknown>) => {
        deferred.push(promise)
      },
    } as unknown as AppRequestContext,
  }
}

type UploadOptions = {
  filename: string
  type: string
  bytes?: Uint8Array
  workspaceId?: string
  files?: ReturnType<typeof makeFiles>
  helixUrl?: string | null
}

/**
 * Drives one upload against a caller-owned in-memory R2 bucket. Previously each
 * invocation hid duplicate cleanup by creating a fresh bucket; shared buckets
 * now expose whether the active or newly staged object was deleted.
 */
async function upload({
  filename,
  type,
  bytes,
  workspaceId,
  files = makeFiles(),
  helixUrl = 'http://localhost:6968',
}: UploadOptions) {
  const content = bytes ?? (await readFile(resolve(FIXTURES, filename)))
  const form = new FormData()
  form.append('file', new File([content], filename, { type }))
  const { objects, bucket } = files
  const id =
    workspaceId ??
    `ws-route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const deferred: Promise<unknown>[] = []
  mockRequireAppRequestContext.mockReturnValueOnce({
    env: {
      FILES: bucket,
      AgentDO: {},
      HYPERDRIVE: {},
      AI: stubAi,
      ...(helixUrl === null ? {} : { HELIX_URL: helixUrl }),
      HELIX_API_KEY: '',
    },
    auth: {},
    waitUntil: (promise: Promise<unknown>) => {
      deferred.push(promise)
    },
  } as unknown as AppRequestContext)
  mockRequireWorkspaceContext.mockResolvedValueOnce({
    session: { user: { id: 'user-route' } },
    workspaceId: id,
  })
  const response = await postBrainFileUpload({
    context: {} as AppRequestContext,
    request: new Request('https://garden.test/api/brain/files', {
      method: 'POST',
      body: form,
    }),
  })
  return { response, objects, deferred, workspaceId: id }
}

describe('POST /api/brain/files', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockBrainItems.clear()
  })

  it('uploads and indexes a file, making its content searchable', async () => {
    const { response, objects, deferred, workspaceId } = await upload({
      filename: 'helixdb.pdf',
      type: 'application/pdf',
    })
    expect(response.status, await response.clone().text()).toBe(201)
    await Promise.all(deferred)
    const { item } = (await response.json()) as { item: { id: string } }
    expect(item.id).toBeTruthy()
    expect(objects.size).toBe(1)
    expect([...objects.keys()][0]).toContain(workspaceId)

    const runtime = ManagedRuntime.make(
      makeWebBrainLive({
        baseUrl: 'http://localhost:6968',
        apiKey: '',
        ai: stubAi,
        files: {
          get: async () => null,
        },
      }),
    )
    const hits = await runtime.runPromise(
      Effect.gen(function* () {
        const brain = yield* Brain
        return yield* brain.search({
          tenantId: WorkspaceId.make(workspaceId),
          query: 'helixdb',
          k: 3,
        })
      }),
    )
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].item.label).toBe('helixdb.pdf')
  })

  it('rejects unsupported file types', async () => {
    const { response } = await upload({
      filename: 'movie.mp4',
      type: 'video/mp4',
      bytes: new Uint8Array(0),
    })
    expect(response.status).toBe(400)
    const { error } = (await response.json()) as { error: string }
    expect(error).toContain('Unsupported file type')
  })

  it('rejects missing files', async () => {
    const { objects, bucket } = makeFiles()
    mockRequireAppRequestContext.mockReturnValueOnce(
      fakeContext({
        FILES: bucket,
        AgentDO: {},
        HYPERDRIVE: {},
        AI: stubAi,
        HELIX_URL: 'http://localhost:6968',
        HELIX_API_KEY: '',
      }).context,
    )
    mockRequireWorkspaceContext.mockResolvedValueOnce({
      session: { user: { id: 'user-route' } },
      workspaceId: 'ws-route',
    })
    const response = await postBrainFileUpload({
      context: {} as AppRequestContext,
      request: new Request('https://garden.test/api/brain/files', {
        method: 'POST',
        body: new FormData(),
      }),
    })
    expect(response.status).toBe(400)
    expect(objects.size).toBe(0)
  })

  it('removes the staged R2 object when Brain configuration is missing', async () => {
    const files = makeFiles()
    const { response, objects } = await upload({
      filename: 'helixdb.pdf',
      type: 'application/pdf',
      files,
      helixUrl: null,
    })
    expect(response.status).toBe(400)
    expect(objects.size).toBe(0)
  })

  it.each([
    {
      order: 'before',
      activeId: '00000000-0000-4000-8000-000000000001',
      duplicateId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    },
    {
      order: 'after',
      activeId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      duplicateId: '00000000-0000-4000-8000-000000000001',
    },
  ])(
    'keeps the active object when its key sorts $order the duplicate',
    async ({ activeId, duplicateId }) => {
      const files = makeFiles()
      const workspaceId = `ws-route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      vi.spyOn(crypto, 'randomUUID')
        .mockReturnValueOnce(activeId)
        .mockReturnValueOnce(duplicateId)

      const first = await upload({
        filename: 'helixdb.pdf',
        type: 'application/pdf',
        workspaceId,
        files,
      })
      expect(first.response.status, await first.response.clone().text()).toBe(
        201,
      )
      await Promise.all(first.deferred)
      const activeKey = [...files.objects.keys()][0]
      expect(activeKey).toContain(activeId)

      const second = await upload({
        filename: 'helixdb.pdf',
        type: 'application/pdf',
        workspaceId,
        files,
      })
      expect(second.response.status).toBe(201)
      await Promise.all(second.deferred)
      const firstBody = (await first.response.json()) as {
        item: { id: string }
      }
      const secondBody = (await second.response.json()) as {
        item: { id: string }
      }
      expect(secondBody.item.id).toBe(firstBody.item.id)
      expect([...files.objects.keys()]).toEqual([activeKey])
    },
  )
})
