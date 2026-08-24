import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureApi } from '@/lib/api/state'
import {
  getBrainFile,
  getBrainFileText,
  listBrainFiles,
  uploadBrainFile,
} from './api'

describe('uploadBrainFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uploads the file and reports byte-level progress', async () => {
    const uploadedItem = {
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'processing' as const,
    }
    const onProgress = vi.fn()

    class FakeXMLHttpRequest {
      static instance: FakeXMLHttpRequest | null = null

      upload = {
        onprogress: null as ((event: ProgressEvent) => void) | null,
      }

      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null

      status = 201
      statusText = 'Created'
      responseText = JSON.stringify({ item: uploadedItem })
      withCredentials = false

      open = vi.fn()
      setRequestHeader = vi.fn()

      send = vi.fn((body: XMLHttpRequestBodyInit | null) => {
        expect(body).toBeInstanceOf(FormData)

        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 42,
          total: 100,
        } as ProgressEvent)

        this.onload?.()
      })

      constructor() {
        FakeXMLHttpRequest.instance = this
      }
    }

    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ item: uploadedItem }, { status: 201 }))

    const transport = configureApi('https://garden.test')
    transport.setWorkspaceId('workspace-1')

    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    await expect(uploadBrainFile(file, onProgress)).resolves.toEqual(
      uploadedItem,
    )

    expect(onProgress).toHaveBeenCalledWith(42)
    expect(fetchMock).not.toHaveBeenCalled()

    const xhr = FakeXMLHttpRequest.instance

    expect(xhr?.open).toHaveBeenCalledWith(
      'POST',
      'https://garden.test/api/brain/files',
    )
    expect(xhr?.withCredentials).toBe(true)
    expect(xhr?.setRequestHeader).toHaveBeenCalledWith(
      'X-Workspace-ID',
      'workspace-1',
    )
  })
})

describe('getBrainFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gets the latest file status', async () => {
    const storedItem = {
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'ready' as const,
    }

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ item: storedItem }))

    configureApi('https://garden.test')

    await expect(getBrainFile('brain-file-1')).resolves.toEqual(storedItem)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://garden.test/api/brain/files/brain-file-1',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })
})

describe('listBrainFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gets the files stored in the active workspace', async () => {
    const storedItems = [
      {
        id: 'brain-file-1',
        name: 'notes.txt',
        status: 'ready' as const,
      },
      {
        id: 'brain-file-2',
        name: 'report.pdf',
        status: 'processing' as const,
      },
    ]

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ items: storedItems }))

    configureApi('https://garden.test')

    await expect(listBrainFiles()).resolves.toEqual(storedItems)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://garden.test/api/brain/files',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })
})

describe('getBrainFileText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gets text content with the active workspace context', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Garden preview notes'))
    const transport = configureApi('https://garden.test')
    transport.setWorkspaceId('workspace-1')

    await expect(getBrainFileText('brain-file-1')).resolves.toBe(
      'Garden preview notes',
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://garden.test/api/brain/files/brain-file-1/content',
      {
        credentials: 'include',
        headers: { 'X-Workspace-ID': 'workspace-1' },
      },
    )
  })
})
