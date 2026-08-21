import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrainFilesPage } from './files-page'

const mockUploadBrainFile = vi.hoisted(() => vi.fn())
const mockGetBrainFile = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({
  getBrainFile: mockGetBrainFile,
  uploadBrainFile: mockUploadBrainFile,
}))

function renderFilesPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrainFilesPage />
    </QueryClientProvider>,
  )
}

describe('BrainFilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBrainFile.mockResolvedValue({
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'processing',
    })
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

    renderFilesPage()

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

    mockGetBrainFile.mockResolvedValue({
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'ready',
    })

    renderFilesPage()

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(mockGetBrainFile).toHaveBeenCalledWith('brain-file-1')
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

    mockGetBrainFile.mockRejectedValueOnce(
      new Error('Brain file status is unavailable'),
    )

    renderFilesPage()

    await user.upload(
      screen.getByLabelText('Choose a document to upload'),
      file,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not check file status.',
    )

    mockGetBrainFile.mockResolvedValueOnce({
      id: 'brain-file-1',
      name: 'notes.txt',
      status: 'ready',
    })

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Ready')).toBeInTheDocument()
  })
})
