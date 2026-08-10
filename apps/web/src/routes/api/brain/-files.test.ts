// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Effect, ManagedRuntime } from 'effect'
import { WorkspaceId } from '@garden/brain/domain'
import { Brain } from '@garden/brain/services/brain'
import { makeWebBrainLive } from '@garden/brain/services/web'
import type { AppRequestContext } from '@/lib/server/context'
import { postBrainFileUpload } from './files'

const FIXTURES = resolve(process.cwd(), '../../packages/brain/fixtures/docs')

const mockRequireAppRequestContext = vi.hoisted(() => vi.fn())
const mockRequireWorkspaceContext = vi.hoisted(() => vi.fn())

vi.mock('@garden/agent-runtime', () => ({
  buildContentDisposition: () => 'inline',
  normalizeDownloadFilename: (name: string) => name,
}))

vi.mock('@/lib/server/context', () => ({
  requireAppRequestContext: mockRequireAppRequestContext,
}))

vi.mock('@/lib/server/control-plane', () => ({
  badRequest: (message: string) =>
    Response.json({ error: message }, { status: 400 }),
  requireWorkspaceContext: mockRequireWorkspaceContext,
}))

const stubAi = {
  run: async (model: string, input: { text: string | string[] }) => {
    if (model !== '@cf/baai/bge-small-en-v1.5')
      throw new Error(`unexpected model ${model}`)
    const texts = Array.isArray(input.text) ? input.text : [input.text ?? '']
    return {
      data: texts.map((t) =>
        Array.from(
          { length: 384 },
          (_, i) => (i + (t?.length ?? 0)) / 384,
        ),
      ),
    }
  },
}

function makeFiles() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    bucket: {
      put: async (key: string, value: Uint8Array) => {
        objects.set(key, value)
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
  return {
    context: {
      env,
      auth: {},
    } as unknown as AppRequestContext,
  }
}

async function upload(filename: string, type: string, bytes?: Uint8Array) {
  const content = bytes ?? (await readFile(resolve(FIXTURES, filename)))
  const form = new FormData()
  form.append('file', new File([content], filename, { type }))
  const { objects, bucket } = makeFiles()
  mockRequireAppRequestContext.mockReturnValueOnce(
    fakeContext({
      FILES: bucket,
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
      body: form,
    }),
  })
  return { response, objects }
}

describe('POST /api/brain/files', () => {
  it('uploads and indexes a file, making its content searchable', async () => {
    const { response, objects } = await upload('helixdb.pdf', 'application/pdf')
    expect(response.status).toBe(201)
    const { item } = (await response.json()) as { item: { id: string } }
    expect(item.id).toBeTruthy()
    expect(objects.size).toBe(1)
    expect([...objects.keys()][0]).toContain('ws-route')

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
          tenantId: WorkspaceId.make('ws-route'),
          query: 'helixdb',
          k: 3,
        })
      }),
    )
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].item.label).toBe('helixdb.pdf')
  })

  it('rejects unsupported file types', async () => {
    const { response } = await upload(
      'movie.mp4',
      'video/mp4',
      new Uint8Array(0),
    )
    expect(response.status).toBe(400)
    const { error } = (await response.json()) as { error: string }
    expect(error).toContain('Unsupported file type')
  })

  it('rejects missing files', async () => {
    const { objects, bucket } = makeFiles()
    mockRequireAppRequestContext.mockReturnValueOnce(
      fakeContext({
        FILES: bucket,
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

  it('uploads the same filename idempotently via canonical upsert', async () => {
    const first = await upload('helixdb.pdf', 'application/pdf')
    const second = await upload('helixdb.pdf', 'application/pdf')
    expect(first.response.status).toBe(201)
    expect(second.response.status).toBe(201)
    const a = (await first.response.json()) as { item: { id: string } }
    const b = (await second.response.json()) as { item: { id: string } }
    expect(a.item.id).toBe(b.item.id)
  })
})
