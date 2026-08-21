import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureApi } from '@/lib/api/state'
import { getBrainFile, listBrainFiles, uploadBrainFile } from './api'

describe('uploadBrainFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads the selected file as multipart form data', async () => {
    const uploadedItem = {
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'processing' as const,
    }

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          item: uploadedItem,
        },
        { status: 201 },
      ),
    )

    configureApi('https://garden.test')

    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    await expect(uploadBrainFile(file)).resolves.toEqual(uploadedItem)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://garden.test/api/brain/files',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )

    const request = fetchMock.mock.calls[0]?.[1]
    const body = request?.body
    const headers = request?.headers as Record<string, string> | undefined

    expect(body).toBeInstanceOf(FormData)
    expect(body instanceof FormData && body.get('file')).toBe(file)
    expect(headers?.['Content-Type']).toBeUndefined()
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
