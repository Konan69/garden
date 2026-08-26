import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { BrainFileSummary } from '../api'
import { brainFileKeys } from '../queries'
import { BrainFilesPage } from './files-page'

const mockUploadBrainFile = vi.hoisted(() => vi.fn())
const mockGetBrainFileText = vi.hoisted(() => vi.fn())
const mockGetBrainFileExtractedText = vi.hoisted(() => vi.fn())
const mockListBrainFiles = vi.hoisted(() => vi.fn())
const mockGetBrainFileBytes = vi.hoisted(() => vi.fn())
const mockPdfGetDocument = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({
  getBrainFileText: mockGetBrainFileText,
  getBrainFileExtractedText: mockGetBrainFileExtractedText,
  listBrainFiles: mockListBrainFiles,
  uploadBrainFile: mockUploadBrainFile,
  getBrainFileBytes: mockGetBrainFileBytes,
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: mockPdfGetDocument,
}))

function renderFilesPage(initialFiles?: BrainFileSummary[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })

  if (initialFiles !== undefined) {
    queryClient.setQueryData(brainFileKeys.list(), initialFiles)
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <BrainFilesPage />
    </QueryClientProvider>,
  )
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
})

afterAll(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BrainFilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListBrainFiles.mockResolvedValue([])
    mockGetBrainFileText.mockResolvedValue('Garden preview notes')
    mockGetBrainFileExtractedText.mockResolvedValue(
      '# Quarterly report\n\nRevenue increased.',
    )
    mockGetBrainFileBytes.mockResolvedValue(
      new Uint8Array([37, 80, 68, 70]).buffer,
    )
    mockPdfGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockImplementation(async (pageNumber: number) => ({
          pageNumber,
          getViewport: ({ scale }: { scale: number }) => ({
            width: 600 * scale,
            height: 800 * scale,
          }),
          render: vi.fn(() => ({
            promise: Promise.resolve(),
            cancel: vi.fn(),
          })),
        })),
      }),
    })
  })

  it('shows files stored in the workspace when the page loads', async () => {
    mockListBrainFiles.mockResolvedValue([
      {
        id: 'stored-file-1',
        name: 'saved-notes.txt',
        status: 'ready',
      },
    ])

    renderFilesPage()

    expect(await screen.findByText('saved-notes.txt')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(mockListBrainFiles).toHaveBeenCalledOnce()
  })

  it('does not poll processing files loaded from storage', async () => {
    vi.useFakeTimers()
    mockListBrainFiles.mockResolvedValue([
      {
        id: 'stored-file-1',
        name: 'stuck-report.xlsx',
        status: 'processing',
      },
    ])

    renderFilesPage()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('stuck-report.xlsx')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })

    expect(mockListBrainFiles).toHaveBeenCalledOnce()
  })

  it('opens and closes a ready file preview', async () => {
    const user = userEvent.setup()

    renderFilesPage([
      {
        id: 'stored-file-1',
        name: 'saved-notes.txt',
        status: 'ready',
      },
    ])

    await user.click(
      await screen.findByRole('button', {
        name: 'Preview saved-notes.txt',
      }),
    )

    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('saved-notes.txt')).toBeInTheDocument()
    expect(
      await within(dialog).findByText('Garden preview notes'),
    ).toBeInTheDocument()
    expect(mockGetBrainFileText).toHaveBeenCalledWith('stored-file-1')
    expect(
      within(dialog).getByRole('link', { name: 'Download' }),
    ).toHaveAttribute('href', '/api/brain/files/stored-file-1/content?download')

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a loading state while file preview content loads', async () => {
    const user = userEvent.setup()

    mockGetBrainFileText.mockReturnValueOnce(new Promise(() => {}))

    renderFilesPage([
      {
        id: 'stored-file-1',
        name: 'saved-notes.txt',
        status: 'ready',
      },
    ])

    await user.click(
      await screen.findByRole('button', {
        name: 'Preview saved-notes.txt',
      }),
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading preview...')
  })

  it('shows a preview error and lets the user try again', async () => {
    const user = userEvent.setup()

    mockGetBrainFileText
      .mockRejectedValueOnce(new Error('Preview unavailable'))
      .mockResolvedValueOnce('Recovered preview notes')

    renderFilesPage([
      {
        id: 'stored-file-1',
        name: 'saved-notes.txt',
        status: 'ready',
      },
    ])

    await user.click(
      await screen.findByRole('button', {
        name: 'Preview saved-notes.txt',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load preview.',
    )

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByText('Recovered preview notes'),
    ).toBeInTheDocument()
    expect(mockGetBrainFileText).toHaveBeenCalledTimes(2)
  })

  it('shows PDF page thumbnails and changes the selected page', async () => {
    const user = userEvent.setup()

    renderFilesPage([
      {
        id: 'stored-pdf-1',
        name: 'quarterly-report.pdf',
        status: 'ready',
      },
    ])

    await user.click(
      await screen.findByRole('button', {
        name: 'Preview quarterly-report.pdf',
      }),
    )

    const dialog = screen.getByRole('dialog')

    expect(await within(dialog).findByText('Page 1 of 2')).toBeInTheDocument()

    const pageNavigation = within(dialog).getByRole('navigation', {
      name: 'PDF pages',
    })

    expect(
      within(pageNavigation).getByRole('button', { name: 'Show page 1' }),
    ).toBeInTheDocument()

    await user.click(
      within(pageNavigation).getByRole('button', { name: 'Show page 2' }),
    )

    expect(within(dialog).getByText('Page 2 of 2')).toBeInTheDocument()
    expect(mockGetBrainFileBytes).toHaveBeenCalledWith('stored-pdf-1')
  })

  it('shows extracted DOCX content in the preview', async () => {
    const user = userEvent.setup()

    renderFilesPage([
      {
        id: 'stored-docx-1',
        name: 'quarterly-report.docx',
        status: 'ready',
      },
    ])

    await user.click(
      await screen.findByRole('button', {
        name: 'Preview quarterly-report.docx',
      }),
    )

    const dialog = screen.getByRole('dialog')

    expect(
      await within(dialog).findByRole('heading', {
        name: 'Quarterly report',
      }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Revenue increased.')).toBeInTheDocument()
    expect(mockGetBrainFileExtractedText).toHaveBeenCalledWith('stored-docx-1')
  })

  it('shows XLSX sheets and changes the selected sheet', async () => {
    const user = userEvent.setup()

    mockGetBrainFileExtractedText.mockResolvedValueOnce(
      [
        '## Revenue',
        '',
        'Month\tRevenue',
        'January\t1000',
        'February\t1250',
        '',
        '## Expenses',
        '',
        'Category\tAmount',
        'Hosting\t200',
      ].join('\n'),
    )

    renderFilesPage([
      {
        id: 'stored-xlsx-1',
        name: 'quarterly-report.xlsx',
        status: 'ready',
      },
    ])

    await user.click(
      await screen.findByRole('button', {
        name: 'Preview quarterly-report.xlsx',
      }),
    )

    const dialog = screen.getByRole('dialog')
    const sheetNavigation = await within(dialog).findByRole('tablist', {
      name: 'Spreadsheet sheets',
    })

    expect(
      within(dialog).getByRole('table', { name: 'Revenue' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('January')).toBeInTheDocument()
    expect(within(dialog).getByText('1000')).toBeInTheDocument()

    await user.click(
      within(sheetNavigation).getByRole('tab', { name: 'Expenses' }),
    )

    expect(
      within(dialog).getByRole('table', { name: 'Expenses' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Hosting')).toBeInTheDocument()
    expect(mockGetBrainFileExtractedText).toHaveBeenCalledWith('stored-xlsx-1')
  })

  it('uses the designed upload and file tile dimensions', async () => {
    renderFilesPage([
      {
        id: 'stored-file-1',
        name: 'saved-notes.txt',
        status: 'ready',
      },
    ])

    const filesRegion = await screen.findByRole('region', { name: 'Files' })
    const uploadTile = within(filesRegion).getByRole('button', {
      name: /add your documents or drag and drop them here/i,
    })
    const fileTile = await within(filesRegion).findByRole('listitem')
    const previewButton = within(fileTile).getByRole('button', {
      name: 'Preview saved-notes.txt',
    })

    expect(uploadTile).toHaveClass('min-h-[7.125rem]', 'sm:w-[24.375rem]')
    expect(fileTile).toHaveClass('min-h-[7.125rem]', 'sm:w-[11.625rem]')
    expect(previewButton).toHaveClass('cursor-pointer')
    expect(
      within(filesRegion).queryByRole('heading', { name: 'Files' }),
    ).not.toBeInTheDocument()
  })

  it('shows a list error and lets the user try again', async () => {
    const user = userEvent.setup()

    mockListBrainFiles.mockRejectedValueOnce(
      new Error('Brain files are unavailable'),
    )

    renderFilesPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load files.',
    )

    mockListBrainFiles.mockResolvedValueOnce([
      {
        id: 'recovered-file-1',
        name: 'recovered-notes.txt',
        status: 'ready',
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('recovered-notes.txt')).toBeInTheDocument()
    expect(mockListBrainFiles).toHaveBeenCalledTimes(2)
  })

  it('shows byte-level progress in the upload modal', async () => {
    const user = userEvent.setup()
    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    mockUploadBrainFile.mockImplementationOnce(
      (_file: File, onProgress: (percentage: number) => void) => {
        onProgress(42)
        return new Promise(() => {})
      },
    )

    renderFilesPage()

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).getByRole('heading', { name: 'Uploading your file' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('notes.txt')).toBeInTheDocument()
    expect(within(dialog).getByText('Uploading file')).toBeInTheDocument()
    expect(within(dialog).getByText('42%')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('progressbar', { name: 'Uploading notes.txt' }),
    ).toHaveAttribute('aria-valuenow', '42')
  })

  it('uploads a selected file and shows its processing state', async () => {
    const user = userEvent.setup()
    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    mockUploadBrainFile.mockResolvedValue({
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'processing',
    })
    mockListBrainFiles.mockResolvedValue([
      {
        id: 'brain-file-1',
        name: 'notes.txt',
        status: 'processing',
      },
    ])

    renderFilesPage([])

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    await waitFor(() => {
      expect(mockUploadBrainFile.mock.calls[0]?.[0]).toBe(file)
    })

    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('uploads a dropped file', async () => {
    const file = new File(['Quarterly report'], 'report.pdf', {
      type: 'application/pdf',
    })

    mockUploadBrainFile.mockResolvedValue({
      id: 'brain-file-2',
      name: 'report.pdf',
      status: 'ready',
    })

    renderFilesPage()

    fireEvent.drop(
      screen.getByRole('button', {
        name: /add your documents or drag and drop them here/i,
      }),
      {
        dataTransfer: {
          files: [file],
        },
      },
    )

    await waitFor(() => {
      expect(mockUploadBrainFile.mock.calls[0]?.[0]).toBe(file)
    })

    expect(await screen.findByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('shows the upload error near the upload surface', async () => {
    const user = userEvent.setup()
    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    mockUploadBrainFile.mockRejectedValue(
      new Error('The Brain service is unavailable.'),
    )

    renderFilesPage()

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Brain service is unavailable.',
    )
  })

  it('updates a processing file when indexing finishes', async () => {
    const user = userEvent.setup()
    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    mockUploadBrainFile.mockResolvedValue({
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'processing',
    })

    mockListBrainFiles.mockResolvedValue([
      {
        id: 'brain-file-1',
        name: 'notes.txt',
        status: 'ready',
      },
    ])

    renderFilesPage([])

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(mockListBrainFiles).toHaveBeenCalledOnce()
  })

  it('shows a status error and lets the user try again', async () => {
    const user = userEvent.setup()
    const file = new File(['Garden notes'], 'notes.txt', {
      type: 'text/plain',
    })

    mockUploadBrainFile.mockResolvedValue({
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'processing',
    })

    mockListBrainFiles.mockRejectedValueOnce(
      new Error('Brain file status is unavailable'),
    )

    renderFilesPage([])

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not refresh file statuses.',
    )

    mockListBrainFiles.mockResolvedValueOnce([
      {
        id: 'brain-file-1',
        name: 'notes.txt',
        status: 'ready',
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Ready')).toBeInTheDocument()
  })
})
